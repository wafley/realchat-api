/**
 * Logika bisnis modul percakapan: pembuatan chat privat, pengiriman
 * pesan lampiran, daftar/detail percakapan, siklus pesan (edit, hapus,
 * semat, bintang, teruskan), status terbaca, bisu, dan bersih-riwayat.
 * Menjadi jembatan antara controller/socket dengan repository.
 */
import * as repository from './conversations.repository';
import * as groupService from '../groups/groups.service';
import { findUserById } from '../auth/auth.repository';
import { findPresenceTargets } from '../users/users.repository';
import { filterVisiblePresenceIds } from '../users/presencePrivacy';
import { NotFoundError, BadRequestError, ForbiddenError, AppError } from '../../utils/errors';
import { toSender } from '../../utils/sender';
import { getIO } from '../../socket/index';
import { forceLeaveConversationRoom } from '../../socket/room';
import { computeRecipientStatus } from '../../socket/activeViewers';
import { sendIncomingPush } from '../devices/devices.service';
import { messageRateLimiter } from '../../socket/handlers/message.handler';
import { unlinkQuietly } from '../../utils/cleanup';
import { env } from '../../config/env';
import path from 'path';
import {
  isBlockedByUser,
  isBlockedByAnyMember,
  hasBlockedAnyMember,
  getBlockRelationUserIds,
} from '../users/blockedUsers.repository';

/**
 * Membuat percakapan privat baru atau mengembalikan yang sudah ada,
 * lalu menggabungkan socket kedua pihak ke room percakapan.
 * @throws BadRequestError jika participantId kosong atau diri sendiri
 * @throws NotFoundError jika partisipan tidak ada / belum verifikasi
 * @throws ForbiddenError jika salah satu pihak memblokir
 */
export async function createConversation(userId: string, data: { participantId: string }) {
  if (!data.participantId) throw new BadRequestError('participantId is required for private chat');
  if (data.participantId === userId)
    throw new BadRequestError('Cannot start a conversation with yourself');

  const participant = await findUserById(data.participantId);
  if (!participant) throw new NotFoundError('Participant not found');
  if (!participant.isVerified)
    throw new BadRequestError('Cannot start a conversation with an unverified user');

  if (await isBlockedByUser(data.participantId, userId)) {
    throw new ForbiddenError('You are blocked by this user');
  }

  if (await isBlockedByUser(userId, data.participantId)) {
    throw new ForbiddenError('You have blocked this user');
  }

  const conversation = await repository.createPrivateConversationIfMissing(
    userId,
    data.participantId,
  );

  const io = getIO();
  io.in(`user:${userId}`)
    .in(`user:${data.participantId}`)
    .socketsJoin(`conversation:${conversation.id}`);

  return conversation;
}

export async function sendAttachmentMessage(
  userId: string,
  conversationId: string,
  data: { caption?: string; replyToId?: string; duration?: number },
  file: Express.Multer.File,
) {
  try {
    // Batasi laju kirim per pengguna untuk mencegah spam.
    if (!messageRateLimiter.allow(userId)) {
      throw new AppError('Rate limit exceeded. Please slow down.', 429);
    }

    const membership = await repository.findConversationMembership(conversationId, userId);
    if (!membership) throw new ForbiddenError('You are not a member of this conversation');

    if (await isBlockedByAnyMember(conversationId, userId)) {
      throw new ForbiddenError('You are blocked by a member of this conversation');
    }

    if (
      membership.conversationType === 'PRIVATE' &&
      (await hasBlockedAnyMember(conversationId, userId))
    ) {
      throw new ForbiddenError('You have blocked a member of this conversation');
    }

    if (data.replyToId) {
      const replyMessage = await repository.findMessageById(data.replyToId);
      if (!replyMessage || replyMessage.conversationId !== conversationId)
        throw new BadRequestError('Replied message not found in this conversation');
    }

    // Tentukan tipe pesan dari mimetype berkas yang diunggah.
    const type = file.mimetype.startsWith('image/')
      ? 'IMAGE'
      : file.mimetype.startsWith('video/')
        ? 'VIDEO'
        : 'FILE';

    const content = data.caption ?? '';
    const duration = type === 'VIDEO' ? (data.duration ?? null) : null;

    const members = await repository.findConversationMemberIds(conversationId);
    const now = new Date();
    // Hitung status awal tiap penerima; bila sedang membuka chat
    // (aktif), pesan langsung berstatus SEEN dengan seenAt sekarang.
    const recipientRows = members
      .filter((member) => member.userId !== userId)
      .map((member) => {
        const status = computeRecipientStatus(conversationId, member.userId);
        return {
          userId: member.userId,
          mutedUntil: member.mutedUntil,
          status,
          ...(status === 'SEEN' ? { seenAt: now } : {}),
        };
      });

    // Pesan + status penerima disimpan dalam satu transaksi atomik.
    const message = await repository.insertAttachmentMessageAtomically(
      conversationId,
      userId,
      {
        type,
        content,
        replyToId: data.replyToId || null,
        fileUrl: `/uploads/${file.filename}`,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        duration,
      },
      recipientRows.map(({ userId: recipientId, status, seenAt }) => ({
        userId: recipientId,
        status,
        seenAt,
      })),
    );

    // Pesan baru membuat percakapan tampil kembali bagi yang
    // pernah menyembunyikannya (hiddenAt dikosongkan).
    await repository.unhideConversationMembers(conversationId, [
      userId,
      ...recipientRows.map((row) => row.userId),
    ]);

    // Tidak ada emit message:status awal: status terbawa pada respons REST
    // dan broadcast message:new; event agregat menyusul saat berubah.

    const senderUser = await findUserById(userId);
    const messagePayload = { ...message, sender: toSender(senderUser) };

    getIO().to(`conversation:${conversationId}`).emit('message:new', messagePayload);

    // Push notification hanya untuk penerima offline (status SENT).
    const offlineTargets = recipientRows
      .filter((row) => row.status === 'SENT')
      .map((row) => ({ userId: row.userId, mutedUntil: row.mutedUntil ?? null }));

    if (offlineTargets.length > 0) {
      void sendIncomingPush({
        conversationId,
        conversationType: membership.conversationType,
        conversationName: membership.conversationName,
        messageId: message.id,
        senderId: userId,
        senderName: senderUser?.fullName || senderUser?.username || userId,
        content: content || file.originalname,
        targets: offlineTargets,
      });
    }

    return messagePayload;
  } catch (error) {
    // Gagal kirim: hapus berkas yang sudah tersimpan agar tidak yatim.
    await unlinkQuietly(file.path);
    throw error;
  }
}

// Kursor komposit "sortKey|id" dienkode base64url; pasangan (waktu, id)
// membuat paginasi keyset tetap stabil walau ada timestamp kembar.
function encodeCompositeCursor(sortKey: Date, conversationId: string): string {
  return Buffer.from(`${sortKey.toISOString()}|${conversationId}`).toString('base64url');
}

// Dekode & validasi kursor komposit: format, sortKey tanggal, dan id UUID.
function decodeCompositeCursor(cursor: string): { sortKey: string; id: string } {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const separator = decoded.indexOf('|');
  if (separator === -1) throw new BadRequestError('Invalid cursor format');

  const sortKey = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(Date.parse(sortKey))) throw new BadRequestError('Invalid cursor sortKey');

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) throw new BadRequestError('Invalid cursor id');

  return { sortKey, id };
}

/**
 * Daftar percakapan pengguna untuk sidebar: nama tampilan, kehadiran
 * lawan bicara, hitungan belum dibaca, pesan terakhir, dan kursor.
 */
export async function getConversations(
  userId: string,
  options: { search?: string; cursor?: string; limit?: number },
) {
  const limit = options.limit ?? 20;
  const cursor = options.cursor ? decodeCompositeCursor(options.cursor) : undefined;
  const rows = await repository.findConversationList(userId, { ...options, cursor, limit });

  // Repository mengambil limit+1 baris; baris ekstra = masih ada halaman.
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Kehadiran (online/lastSeen) disembunyikan bila saling memblokir
  // atau kebijakan privasi peer tidak mengizinkan.
  const blockedIds = await getBlockRelationUserIds(userId);

  // Kumpulkan peer DM pada halaman ini lalu cek kebijakan privasinya sekaligus.
  const peerIds = [
    ...new Set(page.filter((r) => r.type === 'PRIVATE' && r.peerId).map((r) => r.peerId!)),
  ];
  const targetMap = new Map((await findPresenceTargets(peerIds)).map((t) => [t.id, t]));
  const visibleIds = await filterVisiblePresenceIds(userId, targetMap);

  const conversations = page.map((row) => {
    const isPrivate = row.type === 'PRIVATE';
    const presenceHidden =
      isPrivate && row.peerId ? blockedIds.has(row.peerId) || !visibleIds.has(row.peerId) : false;

    const displayName = isPrivate
      ? row.customName || row.peerFullName || row.peerUsername || 'Unknown'
      : row.name || 'Group';

    const avatar = isPrivate ? (row.peerAvatarUrl ?? null) : row.avatarUrl;

    // Pesan terakhir disembunyikan bila lebih tua dari clearedAt.
    const clearedAt = row.clearedAt ? new Date(row.clearedAt) : null;
    const lastMessage =
      row.lastMessageId &&
      (!clearedAt || !row.lastMessageCreatedAt || row.lastMessageCreatedAt > clearedAt)
        ? {
            id: row.lastMessageId,
            content: row.lastMessageContent,
            type: row.lastMessageType,
            senderId: row.lastMessageSenderId,
            sender: {
              username: row.senderUsername,
              fullName: row.senderFullName,
              avatarUrl: row.senderAvatarUrl,
            },
            createdAt: row.lastMessageCreatedAt,
            isDeleted: row.lastMessageIsDeleted,
            fileUrl: row.lastMessageFileUrl ?? null,
            fileName: row.lastMessageFileName ?? null,
            fileSize: row.lastMessageFileSize ?? null,
            mimeType: row.lastMessageMimeType ?? null,
          }
        : null;

    return {
      id: row.id,
      type: row.type,
      name: row.name,
      avatarUrl: row.avatarUrl,
      description: row.description,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      displayName,
      avatar,
      isOnline: isPrivate ? (presenceHidden ? null : (row.peerIsOnline ?? false)) : null,
      lastSeenAt: isPrivate ? (presenceHidden ? null : (row.peerLastSeenAt ?? null)) : null,
      memberCount: isPrivate ? null : (row.memberCount ?? 0),
      myRole: row.myRole,
      mutedUntil: row.mutedUntil,
      clearedAt: row.clearedAt,
      unreadCount: row.unreadCount ?? 0,
      lastMessage,
    };
  });

  const lastItem = page[page.length - 1];
  // Kursor halaman berikutnya memakai kunci urutan item terakhir.
  const nextCursor = hasMore
    ? encodeCompositeCursor(lastItem.lastMessageCreatedAt ?? lastItem.createdAt, lastItem.id)
    : null;

  return { conversations, nextCursor };
}

/** Detail percakapan + anggota; membuka kembali chat yang disembunyikan. */
export async function getConversationDetail(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  // Membuka detail = tampilkan lagi untuk diri sendiri (hiddenAt null)
  // dan pastikan socket pengguna bergabung ke room percakapan.
  await repository.unhideConversationForSelf(conversationId, userId);
  getIO().in(`user:${userId}`).socketsJoin(`conversation:${conversationId}`);

  const members = await repository.findMembersByConversationId(conversationId);
  const me = members.find((m) => m.userId === userId);
  const blockedIds = await getBlockRelationUserIds(userId);

  // Kebijakan privasi kehadiran anggota lain dicek sekaligus (satu query).
  const otherIds = [...new Set(members.map((m) => m.userId).filter((id) => id !== userId))];
  const targetMap = new Map((await findPresenceTargets(otherIds)).map((t) => [t.id, t]));
  const visibleIds = await filterVisiblePresenceIds(userId, targetMap);

  return {
    ...conversation,
    mutedUntil: me?.mutedUntil ?? null,
    clearedAt: me?.clearedAt ?? null,
    members: members.map(
      ({
        username,
        fullName,
        avatarUrl,
        isOnline,
        lastSeenAt,
        id,
        userId: memberId,
        role,
        joinedAt,
      }) => {
        // Blokir selalu menang; di luar itu ikut kebijakan privasi anggota.
        const presenceHidden =
          blockedIds.has(memberId) || (memberId !== userId && !visibleIds.has(memberId));
        return {
          id,
          userId: memberId,
          role,
          joinedAt,
          user: {
            id: memberId,
            username,
            fullName,
            avatarUrl,
            isOnline: presenceHidden ? null : isOnline,
            lastSeenAt: presenceHidden ? null : lastSeenAt ? lastSeenAt.toISOString() : null,
          },
        };
      },
    ),
  };
}

/**
 * Keluar dari percakapan. Grup didelegasikan ke service grup;
 * percakapan privat hanya disembunyikan untuk diri sendiri (hiddenAt)
 * sehingga riwayat lawan tetap utuh.
 */
export async function leaveConversation(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  if (conversation.type === 'GROUP') {
    return groupService.leaveGroup(userId, conversationId);
  }

  await repository.hideConversationForSelf(conversationId, userId);
  await forceLeaveConversationRoom(userId, conversationId);
}

/**
 * Riwayat pesan percakapan dengan paginasi mundur (terbaru -> lama).
 * Pesan sebelum clearedAt pengguna tidak dikembalikan.
 */
export async function getMessages(
  userId: string,
  conversationId: string,
  cursor?: string,
  limit = 50,
) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const membership = await repository.findMembershipByUser(conversationId, userId);
  const decodedCursor = cursor ? decodeCompositeCursor(cursor) : undefined;
  const rawMessages = await repository.findMessagesByConversationId(
    conversationId,
    decodedCursor,
    limit,
    membership?.clearedAt,
    userId,
  );
  // Query mengambil limit+1 baris untuk mendeteksi halaman berikutnya.
  const hasMore = rawMessages.length > limit;
  const messagesList = hasMore ? rawMessages.slice(0, limit) : rawMessages;

  const messages = messagesList.map(
    ({
      minRank,
      maxRank,
      seenAt,
      starredAt,
      senderUsername,
      senderFullName,
      senderAvatarUrl,
      ...message
    }) => ({
      ...message,
      // Semantik centang ala WhatsApp: SEEN hanya bila semua penerima
      // membaca (MIN=2), DELIVERED bila minimal satu menerima (MAX>=1).
      // Untuk pesan masuk, kedua rank = status milik pembaca sendiri.
      status:
        maxRank == null || maxRank < 1
          ? 'SENT'
          : minRank != null && minRank >= 2
            ? 'SEEN'
            : 'DELIVERED',
      seenAt: seenAt ? seenAt.toISOString() : null,
      starredAt: starredAt ? starredAt.toISOString() : null,
      sender: {
        username: senderUsername,
        fullName: senderFullName,
        avatarUrl: senderAvatarUrl,
      },
    }),
  );

  return {
    messages,
    nextCursor: hasMore
      ? encodeCompositeCursor(
          messagesList[messagesList.length - 1].createdAt,
          messagesList[messagesList.length - 1].id,
        )
      : null,
  };
}

/**
 * Bersihkan riwayat untuk diri sendiri: set clearedAt lalu tandai
 * pesan masuk yang tersembunyi itu sebagai SEEN agar unread bersih.
 */
export async function clearConversation(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const row = await repository.clearConversation(conversationId, userId);

  // Pesan sebelum clearedAt tak lagi terlihat; tandai SEEN supaya
  // hitungan belum-dibaca ikut kosong.
  const incomingIds = await repository.findIncomingMessageIdsByConversation(conversationId, userId);
  if (incomingIds.length > 0) {
    await repository.markMessagesSeen(userId, incomingIds, new Date());
  }

  return { clearedAt: row?.clearedAt ? row.clearedAt.toISOString() : null };
}

/**
 * Edit isi pesan milik sendiri lalu siarkan event message:edited.
 * @throws ForbiddenError jika bukan pengirim / bukan anggota
 */
export async function editMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  content: string,
) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.senderId !== userId) throw new ForbiddenError('You can only edit your own messages');
  if (message.conversationId !== conversationId)
    throw new ForbiddenError('Message does not belong to this conversation');
  if (message.isDeleted) throw new BadRequestError('Cannot edit a deleted message');
  if (message.type === 'SYSTEM') throw new BadRequestError('Cannot edit a system message');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const updated = await repository.updateMessageContent(messageId, content);

  getIO().to(`conversation:${message.conversationId}`).emit('message:edited', updated);

  return updated;
}

/**
 * Hapus lunak pesan milik sendiri dan siarkan event message:deleted.
 * Berkas lampiran dihapus fisik hanya bila tidak ada pesan lain
 * (mis. hasil forward) yang masih mereferensikan fileUrl yang sama.
 */
export async function deleteMessage(userId: string, conversationId: string, messageId: string) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.senderId !== userId)
    throw new ForbiddenError('You can only delete your own messages');
  if (message.conversationId !== conversationId)
    throw new ForbiddenError('Message does not belong to this conversation');
  if (message.type === 'SYSTEM') throw new BadRequestError('Cannot delete a system message');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  await repository.softDeleteMessage(messageId);

  // Reference-aware unlink: hitung dulu referensi fileUrl lain.
  if (message.fileUrl && (await repository.countMessageFileReferences(message.fileUrl)) === 0) {
    const filename = message.fileUrl.split('/').pop();
    if (filename) {
      await unlinkQuietly(path.join(env.uploadDir, filename));
    }
  }

  getIO()
    .to(`conversation:${conversationId}`)
    .emit('message:deleted', { conversationId, messageId });
}

/**
 * Sematkan / lepas sematan pesan lalu siarkan event ke room percakapan.
 * @throws BadRequestError bila menyematkan pesan terhapus atau SYSTEM
 */
export async function setMessagePinned(
  userId: string,
  conversationId: string,
  messageId: string,
  isPinned: boolean,
) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.conversationId !== conversationId)
    throw new ForbiddenError('Message does not belong to this conversation');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  if (isPinned && message.isDeleted) throw new BadRequestError('Cannot pin a deleted message');
  if (isPinned && message.type === 'SYSTEM')
    throw new BadRequestError('Cannot pin a system message');

  await repository.updateMessagePinned(messageId, isPinned);

  getIO()
    .to(`conversation:${conversationId}`)
    .emit('message:pin:updated', { conversationId, messageId, isPinned });

  return { isPinned };
}

/**
 * Tandai pesan masuk percakapan sebagai SEEN. Event SEEN agregat ke
 * pengirim hanya dikirim saat pembaca ini adalah yang TERAKHIR —
 * semantik centang biru ala WhatsApp untuk percakapan grup.
 * @param options.before Cutoff opsional: hanya pesan dengan createdAt
 *   <= waktu tsb yang ditandai (sinkronisasi SEEN dari klien)
 */
export async function markConversationAsRead(
  userId: string,
  conversationId: string,
  options?: { before?: Date },
) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const targetIds = await repository.findIncomingMessageIdsByConversation(
    conversationId,
    userId,
    options,
  );
  if (targetIds.length === 0) return { updated: 0, seenAt: null };

  const now = new Date();
  const changedIds = await repository.markMessagesSeen(userId, targetIds, now);

  if (changedIds.length > 0) {
    // Event agregat tanpa userId; seenAt = momen pesan lunas dibaca semua.
    const completion = await repository.findMessageReadCompletion(changedIds);
    for (const row of completion) {
      if (row.seenOthers >= row.otherMembers && row.otherMembers > 0) {
        getIO().to(`user:${row.senderId}`).emit('message:status', {
          messageId: row.messageId,
          status: 'SEEN',
          seenAt: now.toISOString(),
        });
      }
    }
  }

  return { updated: changedIds.length, seenAt: now.toISOString() };
}

/**
 * Daftar pembaca satu pesan untuk modal "Seen by": seluruh anggota
 * non-pengirim beserta status bacaannya. Pesan harus ada di percakapan.
 * @throws NotFoundError jika percakapan/pesan tidak ditemukan
 * @throws ForbiddenError jika peminta bukan anggota percakapan
 */
export async function getMessageReaders(userId: string, conversationId: string, messageId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const message = await repository.findMessageById(messageId);
  if (!message || message.conversationId !== conversationId) {
    throw new NotFoundError('Message not found in this conversation');
  }

  const readers = await repository.findMessageReaders(messageId);
  return readers.map((row) => ({
    ...row,
    seenAt: row.seenAt ? row.seenAt.toISOString() : null,
  }));
}

/**
 * Teruskan pesan ke percakapan tujuan sebagai pesan baru: konten dan
 * metadata berkas disalin (fileUrl dipakai ulang, bukan dipindah),
 * lengkap dengan status penerima, event realtime, dan push notifikasi.
 */
export async function forwardMessage(
  userId: string,
  sourceConversationId: string,
  messageId: string,
  targetConversationId: string,
) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.conversationId !== sourceConversationId)
    throw new ForbiddenError('Message does not belong to this conversation');
  if (message.isDeleted) throw new BadRequestError('Cannot forward a deleted message');
  if (message.type === 'SYSTEM') throw new BadRequestError('Cannot forward a system message');

  const [sourceMember, targetMember] = await Promise.all([
    repository.isMember(sourceConversationId, userId),
    repository.isMember(targetConversationId, userId),
  ]);
  if (!sourceMember) throw new ForbiddenError('You are not a member of this conversation');
  if (!targetMember) throw new ForbiddenError('You are not a member of the target conversation');

  const targetConversation = await repository.findConversationById(targetConversationId);
  if (await isBlockedByAnyMember(targetConversationId, userId)) {
    throw new ForbiddenError('You are blocked by a member of the target conversation');
  }
  if (
    targetConversation?.type === 'PRIVATE' &&
    (await hasBlockedAnyMember(targetConversationId, userId))
  ) {
    throw new ForbiddenError('You have blocked a member of the target conversation');
  }

  const memberRows = await repository.findConversationMemberIds(targetConversationId);
  const now = new Date();
  // Status awal penerima di tujuan; penerima aktif langsung SEEN.
  const recipientRows = memberRows
    .filter((member) => member.userId !== userId)
    .map((member) => {
      const status = computeRecipientStatus(targetConversationId, member.userId);
      return {
        userId: member.userId,
        status,
        ...(status === 'SEEN' ? { seenAt: now } : {}),
      };
    });

  // Pesan salinan + status penerima dibuat dalam satu transaksi.
  const created = await repository.forwardMessageAtomically(
    targetConversationId,
    userId,
    message.content,
    message.type,
    {
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      mimeType: message.mimeType,
      duration: message.duration,
    },
    recipientRows,
  );

  // Tidak ada emit message:status awal: status terbawa pada respons REST
  // forward dan broadcast message:new; event agregat menyusul saat berubah.

  const senderUser = await findUserById(userId);
  const createdPayload = { ...created, sender: toSender(senderUser) };

  getIO().to(`conversation:${targetConversationId}`).emit('message:new', createdPayload);

  const offlineTargets = recipientRows
    .filter((row) => row.status === 'SENT')
    .map((row) => ({
      userId: row.userId,
      mutedUntil: memberRows.find((m) => m.userId === row.userId)?.mutedUntil ?? null,
    }));

  if (message.type !== 'SYSTEM' && offlineTargets.length > 0) {
    void (async () => {
      await sendIncomingPush({
        conversationId: targetConversationId,
        conversationType: targetConversation?.type ?? 'PRIVATE',
        conversationName: targetConversation?.name ?? null,
        messageId: created.id,
        senderId: userId,
        senderName: senderUser?.fullName || senderUser?.username || userId,
        content: message.content,
        targets: offlineTargets,
      });
    })().catch(() => {
      // Push notification failure must not fail the forward response.
    });
  }

  return createdPayload;
}

/** Daftar pesan tersemat percakapan beserta data pengirimnya. */
export async function getPinnedMessages(userId: string, conversationId: string, limit = 50) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const rows = await repository.findPinnedMessagesByConversation(conversationId, limit);

  return rows.map(({ senderUsername, senderFullName, senderAvatarUrl, ...message }) => ({
    ...message,
    sender: {
      username: senderUsername,
      fullName: senderFullName,
      avatarUrl: senderAvatarUrl,
    },
  }));
}

/**
 * Beri / hapus bintang pada pesan untuk pengguna, lalu emit event
 * message:star:updated ke pemilik bintang.
 * @returns starredAt waktu pemberian bintang, null bila dihapus
 */
export async function setMessageStar(
  userId: string,
  conversationId: string,
  messageId: string,
  star: boolean,
) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.conversationId !== conversationId)
    throw new ForbiddenError('Message does not belong to this conversation');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  if (star) {
    if (message.isDeleted) throw new BadRequestError('Cannot star a deleted message');
    if (message.type === 'SYSTEM') throw new BadRequestError('Cannot star a system message');
    await repository.addStar(messageId, userId);
  } else {
    await repository.removeStar(messageId, userId);
  }

  const row = await repository.findStar(messageId, userId);
  const starredAt = star ? (row?.createdAt.toISOString() ?? new Date().toISOString()) : null;

  getIO().to(`user:${userId}`).emit('message:star:updated', {
    messageId,
    isStarred: star,
    starredAt,
  });

  return { starredAt };
}

/**
 * Daftar pesan berbintang milik pengguna lintas percakapan dengan
 * paginasi keyset berbasis (starredAt, id).
 */
export async function getStarredMessages(userId: string, cursor?: string, limit = 50) {
  const decodedCursor = cursor ? decodeCompositeCursor(cursor) : undefined;
  const rows = await repository.findStarredMessages(userId, decodedCursor, limit);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const messages = page.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    type: row.type,
    content: row.content,
    replyToId: row.replyToId,
    isPinned: row.isPinned,
    pinnedAt: row.pinnedAt,
    isEdited: row.isEdited,
    isDeleted: row.isDeleted,
    editedAt: row.editedAt,
    createdAt: row.createdAt,
    isStarred: true,
    starredAt: row.starredAt.toISOString(),
    sender: {
      username: row.senderUsername,
      fullName: row.senderFullName,
      avatarUrl: row.senderAvatarUrl,
    },
    conversation: {
      id: row.conversationId,
      type: row.conversationType,
      name: row.conversationName,
      avatarUrl: row.conversationAvatarUrl,
    },
  }));

  return {
    messages,
    nextCursor: hasMore
      ? encodeCompositeCursor(page[page.length - 1].starredAt, page[page.length - 1].id)
      : null,
  };
}

// "Bisu selamanya" dimodelkan sebagai tanggal yang sangat jauh.
const MUTE_FOREVER_YEARS = 10;

function muteForeverDate(): Date {
  return new Date(Date.now() + MUTE_FOREVER_YEARS * 365 * 24 * 60 * 60 * 1000);
}

/**
 * Bisukan percakapan untuk diri sendiri sampai waktu tertentu;
 * tanpa `until` berarti bisu "selamanya".
 * @throws BadRequestError bila until tidak valid atau di masa lalu
 */
export async function setConversationMute(userId: string, conversationId: string, until?: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  let mutedUntil: Date;
  if (until) {
    const parsed = new Date(until);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestError('Invalid until date');
    if (parsed.getTime() <= Date.now()) throw new BadRequestError('until must be in the future');
    mutedUntil = parsed;
  } else {
    mutedUntil = muteForeverDate();
  }

  const row = await repository.setMutedUntil(conversationId, userId, mutedUntil);
  return { mutedUntil: (row?.mutedUntil ?? mutedUntil).toISOString() };
}

/** Matikan bisu percakapan untuk diri sendiri. */
export async function unmuteConversation(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  await repository.setMutedUntil(conversationId, userId, null);
  return { mutedUntil: null };
}

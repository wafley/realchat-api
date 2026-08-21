/**
 * Lapisan akses data modul percakapan: query Drizzle untuk tabel
 * percakapan, anggota, pesan, status, bintang, dan reaksi. Memuat
 * operasi transaksional ber-advisory-lock agar aman dari race condition.
 */
import db from '../../db/index';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { conversations } from '../../db/schema/conversations';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { messages } from '../../db/schema/messages';
import { messageStatus } from '../../db/schema/messageStatus';
import { messageReactions } from '../../db/schema/messageReactions';
import { messageStars } from '../../db/schema/messageStars';
import { users } from '../../db/schema/users';
import { contacts } from '../../db/schema/contacts';
import { notifications } from '../../db/schema/notifications';
import {
  eq,
  and,
  desc,
  gt,
  lte,
  ne,
  or,
  count,
  ilike,
  isNull,
  sql,
  inArray,
  aliasedTable,
  type SQL,
} from 'drizzle-orm';

/** Kolom dasar percakapan yang dikembalikan ke lapisan service. */
export const conversationColumns = {
  id: conversations.id,
  type: conversations.type,
  name: conversations.name,
  avatarUrl: conversations.avatarUrl,
  description: conversations.description,
  createdBy: conversations.createdBy,
  createdAt: conversations.createdAt,
};

/** Kolom keanggotaan: peran, waktu bisu, dan penanda bersih-riwayat. */
export const memberColumns = {
  id: conversationMembers.id,
  userId: conversationMembers.userId,
  role: conversationMembers.role,
  joinedAt: conversationMembers.joinedAt,
  mutedUntil: conversationMembers.mutedUntil,
  clearedAt: conversationMembers.clearedAt,
};

/** Sisipkan percakapan baru dan kembalikan kolom dasarnya. */
export async function createConversation(data: {
  type: string;
  name?: string;
  createdBy: string;
  description?: string | null;
  avatarUrl?: string | null;
}) {
  const [conversation] = await db.insert(conversations).values(data).returning(conversationColumns);
  return conversation;
}

/** Cari percakapan PRIVATE yang memuat kedua pengguna sekaligus. */
export async function findPrivateConversation(userId1: string, userId2: string) {
  const c1 = db
    .select({ id: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId1))
    .as('c1');

  const [result] = await db
    .select(conversationColumns)
    .from(conversations)
    .innerJoin(c1, eq(c1.id, conversations.id))
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, conversations.id),
        eq(conversationMembers.userId, userId2),
      ),
    )
    .where(eq(conversations.type, 'PRIVATE'))
    .limit(1);

  return result || null;
}

/**
 * Ambil percakapan privat dua pengguna, atau buat bila belum ada.
 * @returns Percakapan yang sudah ada atau yang baru dibuat
 */
export async function createPrivateConversationIfMissing(userId1: string, userId2: string) {
  // Kunci disortir agar pasangan (A,B) dan (B,A) menghasilkan hash sama.
  const lockKey = ['dm', userId1, userId2].sort().join(':');

  return db.transaction(async (tx) => {
    // Advisory lock transaksional: cegah dua request paralel menciptakan
    // dua percakapan privat untuk pasangan yang sama.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const c1 = tx
      .select({ id: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId1))
      .as('c1');

    const [existing] = await tx
      .select(conversationColumns)
      .from(conversations)
      .innerJoin(c1, eq(c1.id, conversations.id))
      .innerJoin(
        conversationMembers,
        and(
          eq(conversationMembers.conversationId, conversations.id),
          eq(conversationMembers.userId, userId2),
        ),
      )
      .where(eq(conversations.type, 'PRIVATE'))
      .limit(1);

    if (existing) return existing;

    const [conversation] = await tx
      .insert(conversations)
      .values({ type: 'PRIVATE', createdBy: userId1 })
      .returning(conversationColumns);

    await tx.insert(conversationMembers).values([
      { conversationId: conversation.id, userId: userId1, role: 'MEMBER' },
      { conversationId: conversation.id, userId: userId2, role: 'MEMBER' },
    ]);

    return conversation;
  });
}

/**
 * Daftar percakapan pengguna untuk sidebar: pesan terakhir, lawan
 * bicara, jumlah anggota, dan hitungan belum dibaca dalam satu query.
 */
export async function findConversationList(
  userId: string,
  options: { search?: string; cursor?: { sortKey: string; id: string }; limit: number },
) {
  const { search, cursor, limit } = options;

  // Keanggotaan milik pengguna: peran, bisu, clearedAt, hiddenAt.
  const mine = db
    .select({
      conversationId: conversationMembers.conversationId,
      role: conversationMembers.role,
      mutedUntil: conversationMembers.mutedUntil,
      clearedAt: conversationMembers.clearedAt,
      hiddenAt: conversationMembers.hiddenAt,
    })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId))
    .as('mine');

  // Semua ID percakapan milik pengguna (dipakai subquery lain).
  const userConversations = db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));

  // Lawan bicara: anggota lain pada percakapan milik pengguna.
  const peer = db
    .select({
      conversationId: conversationMembers.conversationId,
      userId: conversationMembers.userId,
    })
    .from(conversationMembers)
    .where(
      and(
        ne(conversationMembers.userId, userId),
        inArray(conversationMembers.conversationId, userConversations),
      ),
    )
    .as('peer');

  // Alias tabel users untuk profil lawan bicara.
  const peerUser = aliasedTable(users, 'peer_user');

  // Pesan terakhir tiap percakapan memakai DISTINCT ON: satu baris
  // per conversationId dengan createdAt terbaru.
  const lastMessage = db
    .selectDistinctOn([messages.conversationId], {
      conversationId: messages.conversationId,
      id: messages.id,
      content: messages.content,
      type: messages.type,
      senderId: messages.senderId,
      createdAt: messages.createdAt,
      isDeleted: messages.isDeleted,
      fileUrl: messages.fileUrl,
      fileName: messages.fileName,
      fileSize: messages.fileSize,
      mimeType: messages.mimeType,
      senderUsername: users.username,
      senderFullName: users.fullName,
      senderAvatarUrl: users.avatarUrl,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .orderBy(messages.conversationId, desc(messages.createdAt))
    .as('last_message');

  // Jumlah anggota per percakapan (relevan untuk grup).
  const memberCounts = db
    .select({
      conversationId: conversationMembers.conversationId,
      value: count(conversationMembers.id).as('member_count'),
    })
    .from(conversationMembers)
    .where(inArray(conversationMembers.conversationId, userConversations))
    .groupBy(conversationMembers.conversationId)
    .as('member_counts');

  // Hitung pesan masuk (bukan kiriman sendiri) yang belum SEEN.
  const unread = db
    .select({
      conversationId: messages.conversationId,
      value: count().mapWith(Number).as('unread_count'),
    })
    .from(messageStatus)
    .innerJoin(messages, eq(messages.id, messageStatus.messageId))
    .where(
      and(
        eq(messageStatus.userId, userId),
        ne(messageStatus.status, 'SEEN'),
        ne(messages.senderId, userId),
      ),
    )
    .groupBy(messages.conversationId)
    .as('unread');

  // Kunci urutan: waktu pesan terakhir; jatuh ke createdAt percakapan
  // bila belum punya pesan.
  const sortKey = sql`COALESCE(${lastMessage.createdAt}, ${conversations.createdAt})`;

  // Percakapan yang disembunyikan sendiri (hiddenAt) tidak ditampilkan.
  const conditions: (SQL | undefined)[] = [isNull(mine.hiddenAt)];
  if (search) {
    // Escape wildcard LIKE agar input pencarian diperlakukan literal.
    const escaped = search.replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    conditions.push(
      or(
        ilike(conversations.name, pattern),
        ilike(peerUser.username, pattern),
        ilike(peerUser.fullName, pattern),
        ilike(contacts.customName, pattern),
        ilike(lastMessage.content, pattern),
      )!,
    );
  }
  // Paginasi keyset komposit (sortKey, id): tetap deterministik walau
  // ada timestamp kembar; limit+1 untuk deteksi halaman berikutnya.
  if (cursor)
    conditions.push(
      sql`(${sortKey}, ${conversations.id}) < (${cursor.sortKey}::timestamptz, ${cursor.id}::uuid)`,
    );

  return db
    .select({
      id: conversations.id,
      type: conversations.type,
      name: conversations.name,
      avatarUrl: conversations.avatarUrl,
      description: conversations.description,
      createdBy: conversations.createdBy,
      createdAt: conversations.createdAt,
      myRole: mine.role,
      mutedUntil: mine.mutedUntil,
      clearedAt: mine.clearedAt,
      lastMessageId: lastMessage.id,
      lastMessageContent: lastMessage.content,
      lastMessageType: lastMessage.type,
      lastMessageSenderId: lastMessage.senderId,
      lastMessageCreatedAt: lastMessage.createdAt,
      lastMessageIsDeleted: lastMessage.isDeleted,
      lastMessageFileUrl: lastMessage.fileUrl,
      lastMessageFileName: lastMessage.fileName,
      lastMessageFileSize: lastMessage.fileSize,
      lastMessageMimeType: lastMessage.mimeType,
      senderUsername: lastMessage.senderUsername,
      senderFullName: lastMessage.senderFullName,
      senderAvatarUrl: lastMessage.senderAvatarUrl,
      peerId: peerUser.id,
      peerUsername: peerUser.username,
      peerFullName: peerUser.fullName,
      peerAvatarUrl: peerUser.avatarUrl,
      peerIsOnline: peerUser.isOnline,
      peerLastSeenAt: peerUser.lastSeenAt,
      customName: contacts.customName,
      memberCount: memberCounts.value,
      unreadCount: unread.value,
    })
    .from(conversations)
    .innerJoin(mine, eq(mine.conversationId, conversations.id))
    .leftJoin(lastMessage, eq(lastMessage.conversationId, conversations.id))
    .leftJoin(
      peer,
      and(
        eq(peer.conversationId, conversations.id),
        ne(peer.userId, userId),
        eq(conversations.type, 'PRIVATE'),
      ),
    )
    .leftJoin(peerUser, eq(peerUser.id, peer.userId))
    .leftJoin(contacts, and(eq(contacts.userId, userId), eq(contacts.contactId, peer.userId)))
    .leftJoin(memberCounts, eq(memberCounts.conversationId, conversations.id))
    .leftJoin(unread, eq(unread.conversationId, conversations.id))
    .where(and(...conditions))
    .orderBy(sql`${sortKey} DESC NULLS LAST`, desc(conversations.id))
    .limit(limit + 1);
}

/** Ambil satu percakapan berdasarkan ID. */
export async function findConversationById(id: string) {
  const [result] = await db
    .select(conversationColumns)
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return result || null;
}

/** Anggota percakapan beserta profil publik penggunanya. */
export async function findMembersByConversationId(conversationId: string) {
  return db
    .select({
      ...memberColumns,
      username: users.username,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      isOnline: users.isOnline,
      lastSeenAt: users.lastSeenAt,
    })
    .from(conversationMembers)
    .leftJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, conversationId));
}

/** True bila pengguna adalah anggota percakapan. */
export async function isMember(conversationId: string, userId: string) {
  const [result] = await db
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return !!result;
}

/** Baris keanggotaan pengguna (kolom clearedAt untuk filter riwayat). */
export async function findMembershipByUser(conversationId: string, userId: string) {
  const [result] = await db
    .select({ clearedAt: conversationMembers.clearedAt })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return result || null;
}

/** Hapus keanggotaan pengguna dari percakapan. */
export async function removeMember(conversationId: string, userId: string) {
  await db
    .delete(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    );
}

/**
 * Sembunyikan percakapan untuk diri sendiri via hiddenAt; data pesan
 * dan tampilan bagi pengguna lain tidak berubah.
 */
export async function hideConversationForSelf(conversationId: string, userId: string) {
  await db
    .update(conversationMembers)
    .set({ hiddenAt: new Date() })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    );
}

/** Tampilkan kembali percakapan yang disembunyikan untuk diri sendiri. */
export async function unhideConversationForSelf(conversationId: string, userId: string) {
  await db
    .update(conversationMembers)
    .set({ hiddenAt: null })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    );
}

/** Tampilkan kembali percakapan bagi banyak anggota (pesan baru masuk). */
export async function unhideConversationMembers(conversationId: string, userIds: string[]) {
  if (userIds.length === 0) return;
  await db
    .update(conversationMembers)
    .set({ hiddenAt: null })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        inArray(conversationMembers.userId, userIds),
      ),
    );
}

/** Buat percakapan grup + anggota awal dalam satu transaksi. */
export async function createGroupAtomically(
  data: {
    type: string;
    name?: string;
    createdBy: string;
    description?: string | null;
    avatarUrl?: string | null;
  },
  members: { userId: string; role: string }[],
) {
  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values(data)
      .returning(conversationColumns);
    await tx.insert(conversationMembers).values(
      members.map((m) => ({
        conversationId: conversation.id,
        userId: m.userId,
        role: m.role,
      })),
    );
    return conversation;
  });
}

/**
 * Tambah anggota grup secara atomik dengan cek duplikat dan kuota.
 * @returns ID pengguna yang benar-benar ditambahkan
 * @throws BadRequestError jika semua sudah anggota atau kuota penuh
 */
export async function addMembersAtomically(
  conversationId: string,
  userIds: string[],
  maxMembers: number,
) {
  return db.transaction(async (tx) => {
    // Advisory lock per-grup: cegah balapan pembacaan jumlah anggota
    // saat penambahan/penghapusan anggota bersamaan.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'group:' + conversationId}))`);
    const existing = await tx
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));
    const existingIds = new Set(existing.map((r) => r.userId));
    const newIds = userIds.filter((id) => !existingIds.has(id));
    if (newIds.length === 0) throw new BadRequestError('All users are already members');
    if (existing.length + newIds.length > maxMembers)
      throw new BadRequestError(`Group cannot have more than ${maxMembers} members`);
    await tx
      .insert(conversationMembers)
      .values(newIds.map((id) => ({ conversationId, userId: id, role: 'MEMBER' })));
    return newIds;
  });
}

/**
 * Keluarkan anggota secara atomik; blokir penghapusan admin terakhir.
 * @throws NotFoundError jika target bukan anggota
 * @throws BadRequestError jika target adalah satu-satunya admin
 */
export async function removeMemberAtomically(conversationId: string, targetUserId: string) {
  return db.transaction(async (tx) => {
    // Advisory lock per-grup agar cek "admin terakhir" tidak balapan
    // dengan perubahan peran/keluar anggota lain.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'group:' + conversationId}))`);
    const members = await tx
      .select({ userId: conversationMembers.userId, role: conversationMembers.role })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));
    const target = members.find((m) => m.userId === targetUserId);
    if (!target) throw new NotFoundError('User is not a member of this group');
    if (target.role === 'ADMIN') {
      const adminCount = members.filter((m) => m.role === 'ADMIN').length;
      if (adminCount <= 1) throw new BadRequestError('Cannot remove the last admin');
    }
    await tx
      .delete(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, targetUserId),
        ),
      );
  });
}

/**
 * Ubah peran anggota secara atomik; blokir demosi admin terakhir.
 * @throws NotFoundError jika target bukan anggota
 * @throws BadRequestError jika demosi menyisakan nol admin
 */
export async function changeRoleAtomically(
  conversationId: string,
  targetUserId: string,
  role: string,
) {
  return db.transaction(async (tx) => {
    // Advisory lock per-grup: konsisten dengan operasi anggota lain.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'group:' + conversationId}))`);
    const members = await tx
      .select({ userId: conversationMembers.userId, role: conversationMembers.role })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));
    const target = members.find((m) => m.userId === targetUserId);
    if (!target) throw new NotFoundError('User is not a member of this group');
    if (role === 'MEMBER' && target.role === 'ADMIN') {
      const adminCount = members.filter((m) => m.role === 'ADMIN').length;
      if (adminCount <= 1) throw new BadRequestError('Cannot demote the last admin');
    }
    await tx
      .update(conversationMembers)
      .set({ role })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, targetUserId),
        ),
      );
  });
}

/**
 * Keluar grup secara atomik: bila pelaku pemilik grup, kepemilikan
 * ditransfer ke admin/member terpilih; bila admin terakhir, satu
 * member dipromosikan agar grup tetap punya admin.
 * @returns promotedUserId dan transferredToId bila terjadi
 */
export async function leaveGroupAtomically(conversationId: string, userId: string) {
  return db.transaction(async (tx) => {
    // Advisory lock per-grup: promosi/transfer tidak boleh diselingi
    // operasi anggota lain.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'group:' + conversationId}))`);
    const [conversation] = await tx
      .select({ createdBy: conversations.createdBy })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    const members = await tx
      .select({ userId: conversationMembers.userId, role: conversationMembers.role })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));
    const current = members.find((m) => m.userId === userId);
    if (!current) throw new NotFoundError('You are not a member of this group');

    let promotedUserId: string | null = null;
    let transferredToId: string | null = null;

    const admins = members.filter((m) => m.role === 'ADMIN');
    if (conversation?.createdBy === userId) {
      // Pemilik keluar: penerus = admin lain, atau member pertama
      // (dipromosikan jadi admin); createdBy ikut berpindah.
      const successor =
        admins.find((m) => m.userId !== userId) ?? members.find((m) => m.role === 'MEMBER');
      if (successor) {
        transferredToId = successor.userId;
        if (successor.role === 'MEMBER') {
          promotedUserId = successor.userId;
          await tx
            .update(conversationMembers)
            .set({ role: 'ADMIN' })
            .where(
              and(
                eq(conversationMembers.conversationId, conversationId),
                eq(conversationMembers.userId, successor.userId),
              ),
            );
        }
        await tx
          .update(conversations)
          .set({ createdBy: successor.userId })
          .where(eq(conversations.id, conversationId));
      }
    } else if (current.role === 'ADMIN' && admins.length === 1) {
      // Admin terakhir (bukan pemilik) keluar: promosi satu member
      // supaya grup tidak kehilangan admin.
      const nonAdmin = members.filter((m) => m.role === 'MEMBER');
      if (nonAdmin.length > 0) {
        promotedUserId = nonAdmin[0].userId;
        await tx
          .update(conversationMembers)
          .set({ role: 'ADMIN' })
          .where(
            and(
              eq(conversationMembers.conversationId, conversationId),
              eq(conversationMembers.userId, promotedUserId),
            ),
          );
      }
    }

    // Terakhir: hapus keanggotaan pelaku keluar.
    await tx
      .delete(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId),
        ),
      );

    return { promotedUserId, transferredToId };
  });
}

const messageColumns = {
  id: messages.id,
  conversationId: messages.conversationId,
  senderId: messages.senderId,
  type: messages.type,
  content: messages.content,
  replyToId: messages.replyToId,
  fileUrl: messages.fileUrl,
  fileName: messages.fileName,
  fileSize: messages.fileSize,
  mimeType: messages.mimeType,
  duration: messages.duration,
  isPinned: messages.isPinned,
  pinnedAt: messages.pinnedAt,
  isEdited: messages.isEdited,
  isDeleted: messages.isDeleted,
  editedAt: messages.editedAt,
  createdAt: messages.createdAt,
};

const pinnedMessageSenderColumns = {
  senderUsername: users.username,
  senderFullName: users.fullName,
  senderAvatarUrl: users.avatarUrl,
};

const senderUser = aliasedTable(users, 'sender_user');

/** Profil publik pengguna untuk kartu anggota. */
export const memberUserColumns = {
  username: users.username,
  fullName: users.fullName,
  avatarUrl: users.avatarUrl,
  isOnline: users.isOnline,
  lastSeenAt: users.lastSeenAt,
};

/**
 * Pesan percakapan untuk paginasi mundur (terbaru -> terlama).
 * @param cursor Kursor komposit (createdAt, id) halaman sebelumnya
 * @param clearedAt Batas bawah waktu akibat bersih-riwayat pengguna
 * @param userId Bila diisi, status baca memakai sudut pandang user tsb
 */
export async function findMessagesByConversationId(
  conversationId: string,
  cursor?: { sortKey: string; id: string },
  limit = 50,
  clearedAt?: Date | null,
  userId?: string,
) {
  // Keyset (createdAt, id) untuk kursor; clearedAt menyembunyikan
  // pesan sebelum riwayat dibersihkan pengguna.
  const conditions = [eq(messages.conversationId, conversationId)];
  if (clearedAt) conditions.push(gt(messages.createdAt, clearedAt));
  if (cursor)
    conditions.push(
      sql`(${messages.createdAt}, ${messages.id}) < (${cursor.sortKey}::timestamptz, ${cursor.id}::uuid)`,
    );

  // Agregat status seluruh penerima per pesan: rank maksimum menentukan
  // status gabungan (0=SENT, 1=DELIVERED, 2=SEEN).
  const statusAgg = db
    .select({
      messageId: messageStatus.messageId,
      statusRank:
        sql<number>`MAX(CASE ${messageStatus.status} WHEN 'SEEN' THEN 2 WHEN 'DELIVERED' THEN 1 ELSE 0 END)`.as(
          'status_rank',
        ),
      seenAt: sql<Date | null>`MIN(${messageStatus.seenAt})`
        .mapWith((v: unknown) => (v === null || v === undefined ? null : new Date(v as string)))
        .as('seen_at'),
    })
    .from(messageStatus)
    .groupBy(messageStatus.messageId)
    .as('status_agg');

  // Status baca versi pengguna ini (untuk pesan yang dia terima).
  const myStatusAgg = userId
    ? db
        .select({
          messageId: messageStatus.messageId,
          statusRank:
            sql<number>`MAX(CASE ${messageStatus.status} WHEN 'SEEN' THEN 2 WHEN 'DELIVERED' THEN 1 ELSE 0 END)`.as(
              'my_status_rank',
            ),
          seenAt: sql<Date | null>`MIN(${messageStatus.seenAt})`
            .mapWith((v: unknown) => (v === null || v === undefined ? null : new Date(v as string)))
            .as('my_seen_at'),
        })
        .from(messageStatus)
        .where(eq(messageStatus.userId, userId))
        .groupBy(messageStatus.messageId)
        .as('my_status_agg')
    : undefined;

  // Tanda bintang milik pengguna (subquery kosong bila tak diminta).
  const star = userId
    ? db
        .select({ messageId: messageStars.messageId, starredAt: messageStars.createdAt })
        .from(messageStars)
        .where(eq(messageStars.userId, userId))
        .as('star_agg')
    : undefined;

  // Pengirim melihat agregat seluruh penerima; penerima melihat
  // status bacaannya sendiri.
  const query = db
    .select({
      ...messageColumns,
      statusRank:
        myStatusAgg && userId
          ? sql<number>`CASE WHEN ${messages.senderId} = ${userId} THEN ${statusAgg.statusRank} ELSE ${myStatusAgg.statusRank} END`
          : statusAgg.statusRank,
      seenAt:
        myStatusAgg && userId
          ? sql<Date | null>`CASE WHEN ${messages.senderId} = ${userId} THEN ${statusAgg.seenAt} ELSE ${myStatusAgg.seenAt} END`.mapWith(
              (v: unknown) => (v === null || v === undefined ? null : new Date(v as string)),
            )
          : statusAgg.seenAt,
      isStarred: star ? sql<boolean>`${star.messageId} IS NOT NULL` : sql<boolean>`false`,
      starredAt: star ? star.starredAt : sql<Date | null>`NULL`,
      senderUsername: senderUser.username,
      senderFullName: senderUser.fullName,
      senderAvatarUrl: senderUser.avatarUrl,
    })
    .from(messages)
    .leftJoin(statusAgg, eq(statusAgg.messageId, messages.id))
    .leftJoin(senderUser, eq(senderUser.id, messages.senderId));

  if (myStatusAgg) query.leftJoin(myStatusAgg, eq(myStatusAgg.messageId, messages.id));
  if (star) query.leftJoin(star, eq(star.messageId, messages.id));

  // limit+1: baris ekstra menandakan masih ada halaman berikutnya.
  return query
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);
}

/**
 * Catat clearedAt keanggotaan: pesan sebelum waktu ini dianggap
 * tidak ada bagi pengguna tersebut.
 */
export async function clearConversation(conversationId: string, userId: string) {
  const [row] = await db
    .update(conversationMembers)
    .set({ clearedAt: sql`now()` })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .returning({ clearedAt: conversationMembers.clearedAt });
  return row || null;
}

/** Atur kedaluwarsa bisu keanggotaan; null berarti tidak dibisukan. */
export async function setMutedUntil(
  conversationId: string,
  userId: string,
  mutedUntil: Date | null,
) {
  const [row] = await db
    .update(conversationMembers)
    .set({ mutedUntil })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .returning({ mutedUntil: conversationMembers.mutedUntil });
  return row || null;
}

/** Semua fileUrl lampiran percakapan (bahan pembersihan berkas). */
export async function findConversationAttachmentPaths(conversationId: string) {
  const rows = await db
    .select({ fileUrl: messages.fileUrl })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), sql`${messages.fileUrl} IS NOT NULL`));
  return rows.map((r) => r.fileUrl as string);
}

/**
 * Hitung pesan aktif (belum dihapus) yang memakai fileUrl yang sama.
 * @param excludeConversationId Kecualikan pesan dari percakapan ini
 * @returns Jumlah referensi lain; 0 berarti berkas aman di-unlink
 */
export async function countMessageFileReferences(fileUrl: string, excludeConversationId?: string) {
  const conditions: SQL[] = [eq(messages.fileUrl, fileUrl), eq(messages.isDeleted, false)];
  if (excludeConversationId) {
    conditions.push(ne(messages.conversationId, excludeConversationId));
  }
  const [row] = await db
    .select({ value: count() })
    .from(messages)
    .where(and(...conditions));
  return Number(row?.value ?? 0);
}

/** Hapus percakapan dan notifikasi terkait dalam satu transaksi. */
export async function deleteConversation(conversationId: string) {
  await db.transaction(async (tx) => {
    const messageIds = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    if (messageIds.length > 0) {
      await tx.delete(notifications).where(
        inArray(
          notifications.messageId,
          messageIds.map((m) => m.id),
        ),
      );
    }
    await tx.delete(notifications).where(eq(notifications.conversationId, conversationId));
    await tx.delete(conversations).where(eq(conversations.id, conversationId));
  });
}

/** Ambil satu pesan berdasarkan ID. */
export async function findMessageById(id: string) {
  const [message] = await db
    .select(messageColumns)
    .from(messages)
    .where(eq(messages.id, id))
    .limit(1);
  return message || null;
}

/** Ubah isi pesan; tandai isEdited beserta waktunya. */
export async function updateMessageContent(id: string, content: string) {
  const [message] = await db
    .update(messages)
    .set({ content, isEdited: true, editedAt: new Date(), updatedAt: new Date() })
    .where(eq(messages.id, id))
    .returning();
  return message || null;
}

/** Hapus lunak: isDeleted=true dan isi pesan dikosongkan. */
export async function softDeleteMessage(id: string) {
  const [message] = await db
    .update(messages)
    .set({ isDeleted: true, content: '', updatedAt: new Date() })
    .where(eq(messages.id, id))
    .returning(messageColumns);
  return message || null;
}

/** Atur sematan pesan; pinnedAt diisi/dikosongkan sesuai status. */
export async function updateMessagePinned(id: string, isPinned: boolean) {
  const now = new Date();
  const [message] = await db
    .update(messages)
    .set({
      isPinned,
      pinnedAt: isPinned ? now : null,
      updatedAt: now,
    })
    .where(eq(messages.id, id))
    .returning(messageColumns);
  return message || null;
}

/** Pesan tersemat percakapan, urut waktu sematan terbaru. */
export async function findPinnedMessagesByConversation(conversationId: string, limit = 50) {
  return db
    .select({ ...messageColumns, ...pinnedMessageSenderColumns })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.isPinned, true),
        eq(messages.isDeleted, false),
        ne(messages.type, 'SYSTEM'),
      ),
    )
    .orderBy(desc(messages.pinnedAt), desc(messages.createdAt))
    .limit(limit);
}

/** Sisipkan pesan baru (termasuk tipe SYSTEM) dan kembalikan barisnya. */
export async function insertMessage(data: {
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
}) {
  const [message] = await db.insert(messages).values(data).returning();
  return message || null;
}

/** Isi status awal (SENT/DELIVERED) untuk pengirim & penerima. */
export async function insertMessageStatuses(
  rows: { messageId: string; userId: string; status: 'SENT' | 'DELIVERED' }[],
) {
  if (rows.length === 0) return;
  await db.insert(messageStatus).values(rows);
}

/** Keanggotaan + tipe/nama percakapan; untuk otorisasi & payload push. */
export async function findConversationMembership(conversationId: string, userId: string) {
  const [row] = await db
    .select({
      conversationType: conversations.type,
      conversationName: conversations.name,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return row || null;
}

/**
 * Simpan pesan lampiran + seluruh baris status penerima dalam satu
 * transaksi agar pesan tidak pernah "tanpa status".
 */
export async function insertAttachmentMessageAtomically(
  conversationId: string,
  senderId: string,
  data: {
    type: string;
    content: string;
    replyToId: string | null;
    fileUrl: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    duration: number | null;
  },
  recipientStatuses: { userId: string; status: 'DELIVERED' | 'SENT' | 'SEEN'; seenAt?: Date }[],
) {
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(messages)
      .values({
        conversationId,
        senderId,
        type: data.type,
        content: data.content,
        replyToId: data.replyToId,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        duration: data.duration,
      })
      .returning();

    await tx
      .insert(messageStatus)
      .values([
        { messageId: message.id, userId: senderId, status: 'SENT' },
        ...recipientStatuses.map((r) => ({ messageId: message.id, ...r })),
      ]);

    return message;
  });
}

/**
 * Salin pesan (termasuk metadata berkas; fileUrl dipakai ulang, bukan
 * dipindah) ke percakapan tujuan beserta status penerima, atomik.
 */
export async function forwardMessageAtomically(
  targetConversationId: string,
  senderId: string,
  content: string,
  type: string,
  file: {
    fileUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    duration: number | null;
  },
  recipientStatuses: { userId: string; status: 'DELIVERED' | 'SENT' | 'SEEN'; seenAt?: Date }[],
) {
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(messages)
      .values({ conversationId: targetConversationId, senderId, content, type, ...file })
      .returning();

    await tx
      .insert(messageStatus)
      .values([
        { messageId: message.id, userId: senderId, status: 'SENT' },
        ...recipientStatuses.map((r) => ({ messageId: message.id, ...r })),
      ]);

    return message;
  });
}

/** ID seluruh anggota + mutedUntil (bahan notifikasi/push). */
export async function findConversationMemberIds(conversationId: string) {
  return db
    .select({ userId: conversationMembers.userId, mutedUntil: conversationMembers.mutedUntil })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
}

/**
 * ID pesan masuk (bukan kiriman sendiri) pada percakapan.
 * @param options.before Cutoff opsional: hanya pesan dengan createdAt
 *   <= waktu tsb (sinkronisasi SEEN dari klien)
 */
export async function findIncomingMessageIdsByConversation(
  conversationId: string,
  userId: string,
  options?: { before?: Date },
) {
  return (
    await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          ne(messages.senderId, userId),
          options?.before ? lte(messages.createdAt, options.before) : undefined,
        ),
      )
  ).map((row) => row.id);
}

/**
 * Tandai pesan SEEN untuk satu pengguna: UPDATE baris lama, INSERT
 * baris yang belum ada (idempoten via onConflictDoUpdate).
 * @returns ID pesan yang statusnya berubah menjadi SEEN
 */
export async function markMessagesSeen(userId: string, messageIds: string[], seenAt: Date) {
  // Cocokkan banyak UUID sekaligus lewat ANY(uuid[]) agar hemat round-trip.
  const messageIdIn = (ids: string[]) =>
    sql`${messageStatus.messageId} = ANY(${`{${ids.join(',')}}`}::uuid[])`;

  // Pisahkan pesan yang sudah punya baris status (cukup UPDATE)
  // dari yang belum (perlu INSERT).
  const existingRows = await db
    .select({ messageId: messageStatus.messageId })
    .from(messageStatus)
    .where(and(eq(messageStatus.userId, userId), messageIdIn(messageIds)));
  const existingIds = new Set(existingRows.map((row) => row.messageId));

  const updated = await db
    .update(messageStatus)
    .set({ status: 'SEEN', seenAt, updatedAt: seenAt })
    .where(
      and(
        eq(messageStatus.userId, userId),
        ne(messageStatus.status, 'SEEN'),
        messageIdIn(messageIds),
      ),
    )
    .returning({ messageId: messageStatus.messageId });

  const newIds = messageIds.filter((id) => !existingIds.has(id));
  if (newIds.length > 0) {
    await db
      .insert(messageStatus)
      .values(
        newIds.map((id) => ({
          messageId: id,
          userId,
          status: 'SEEN' as const,
          seenAt,
          updatedAt: seenAt,
        })),
      )
      .onConflictDoUpdate({
        target: [messageStatus.messageId, messageStatus.userId],
        set: { status: 'SEEN', seenAt, updatedAt: seenAt },
      });
  }

  return [...new Set([...updated.map((row) => row.messageId), ...newIds])];
}

/** Petakan messageId -> senderId untuk emit status ke pengirim. */
export async function findMessageSenders(messageIds: string[]) {
  if (messageIds.length === 0) return [];
  return db
    .select({ id: messages.id, senderId: messages.senderId })
    .from(messages)
    .where(inArray(messages.id, messageIds));
}

/** Tambah bintang pesan untuk pengguna; abaikan bila sudah ada. */
export async function addStar(messageId: string, userId: string) {
  await db.insert(messageStars).values({ messageId, userId }).onConflictDoNothing();
}

/** Hapus bintang pesan milik pengguna. */
export async function removeStar(messageId: string, userId: string) {
  await db
    .delete(messageStars)
    .where(and(eq(messageStars.messageId, messageId), eq(messageStars.userId, userId)));
}

/**
 * Pesan berbintang milik pengguna untuk paginasi keyset.
 * @param cursor Kursor komposit (starredAt, messageId)
 */
export async function findStarredMessages(
  userId: string,
  cursor?: { sortKey: string; id: string },
  limit = 50,
) {
  const stars = db
    .select({
      messageId: messageStars.messageId,
      starredAt: messageStars.createdAt,
    })
    .from(messageStars)
    .where(eq(messageStars.userId, userId))
    .as('stars');

  const senderUser = aliasedTable(users, 'star_sender');

  // Keyset pada (starredAt, messageId); limit+1 mendeteksi halaman
  // berikutnya.
  const conditions: SQL[] = [];
  if (cursor)
    conditions.push(
      sql`(${stars.starredAt}, ${stars.messageId}) < (${cursor.sortKey}::timestamptz, ${cursor.id}::uuid)`,
    );

  return db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      senderId: messages.senderId,
      type: messages.type,
      content: messages.content,
      replyToId: messages.replyToId,
      isPinned: messages.isPinned,
      pinnedAt: messages.pinnedAt,
      isEdited: messages.isEdited,
      isDeleted: messages.isDeleted,
      editedAt: messages.editedAt,
      createdAt: messages.createdAt,
      starredAt: stars.starredAt,
      senderUsername: senderUser.username,
      senderFullName: senderUser.fullName,
      senderAvatarUrl: senderUser.avatarUrl,
      conversationType: conversations.type,
      conversationName: conversations.name,
      conversationAvatarUrl: conversations.avatarUrl,
    })
    .from(stars)
    .innerJoin(messages, eq(messages.id, stars.messageId))
    .innerJoin(senderUser, eq(senderUser.id, messages.senderId))
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(...conditions))
    .orderBy(desc(stars.starredAt), desc(stars.messageId))
    .limit(limit + 1);
}

/** Waktu dibuatnya bintang sebuah pesan untuk pengguna. */
export async function findStar(messageId: string, userId: string) {
  const [row] = await db
    .select({ createdAt: messageStars.createdAt })
    .from(messageStars)
    .where(and(eq(messageStars.messageId, messageId), eq(messageStars.userId, userId)))
    .limit(1);
  return row || null;
}

/** Cari reaksi emoji tertentu dari pengguna pada sebuah pesan. */
export async function findReaction(messageId: string, userId: string, emoji: string) {
  const [row] = await db
    .select({ id: messageReactions.id })
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji),
      ),
    )
    .limit(1);
  return row || null;
}

/** Tambahkan reaksi emoji dari pengguna pada pesan. */
export async function addReaction(messageId: string, userId: string, emoji: string) {
  await db.insert(messageReactions).values({ messageId, userId, emoji });
}

/** Hapus reaksi emoji tertentu dari pengguna pada pesan. */
export async function removeReaction(messageId: string, userId: string, emoji: string) {
  await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji),
      ),
    );
}

/** Semua reaksi (emoji + userId) untuk sebuah pesan. */
export async function findReactionsByMessage(messageId: string) {
  return db
    .select({
      emoji: messageReactions.emoji,
      userId: messageReactions.userId,
    })
    .from(messageReactions)
    .where(eq(messageReactions.messageId, messageId));
}

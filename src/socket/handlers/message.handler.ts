/**
 * Handler Socket.IO untuk seluruh siklus pesan: kirim, tandai dibaca, hapus,
 * pin/unpin, star/unstar, dan reaksi. Setiap event memvalidasi payload,
 * keanggotaan percakapan, dan batas laju sebelum menulis ke database.
 * Juga menyediakan catch-up delivery status DELIVERED saat user reconnect.
 */
import { Server, Socket } from 'socket.io';
import db from '../../db/index';
import { messages } from '../../db/schema/messages';
import { messageStatus } from '../../db/schema/messageStatus';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { conversations } from '../../db/schema/conversations';
import { eq, and, ne, sql, inArray } from 'drizzle-orm';
import {
  sendMessageSchema,
  messageSeenSchema,
  pinMessageSchema,
  reactionSchema,
} from '../../modules/conversations/conversations.validator';
import {
  updateMessagePinned,
  findReaction,
  addReaction,
  removeReaction,
  findReactionsByMessage,
  addStar,
  removeStar,
  countMessageFileReferences,
  findMessageReadCompletion,
} from '../../modules/conversations/conversations.repository';
import { findUserById } from '../../modules/auth/auth.repository';
import {
  isBlockedByAnyMember,
  hasBlockedAnyMember,
} from '../../modules/users/blockedUsers.repository';
import { notifyConversationMentions } from '../../modules/notifications/notifications.service';
import { buildInitialReceipt } from '../../modules/conversations/conversations.service';
import { toSender } from '../../utils/sender';
import { sendIncomingPush } from '../../modules/devices/devices.service';
import { env } from '../../config/env';
import { unlinkQuietly } from '../../utils/cleanup';
import path from 'path';
import { createMessageRateLimiter, createFixedWindowLimiter } from '../rateLimit';
import { computeRecipientStatus } from '../activeViewers';

/**
 * Limiter laju pesan gabungan (per detik + per menit) per user. Dipakai
 * bersama oleh event message:send dan endpoint REST pengiriman pesan.
 */
const messageRateLimiter = createMessageRateLimiter({
  perSecond: env.messageRatePerSecond,
  perMinute: env.messageRatePerMinute,
});

export { messageRateLimiter };

// Throttle event seen per user+percakapan: satu eksekusi per jendela waktu.
const seenLimiter = createFixedWindowLimiter({
  windowMs: env.seenThrottleMs,
  max: 1,
});

// Throttle pin/unpin per user.
const pinLimiter = createFixedWindowLimiter({
  windowMs: env.pinThrottleMs,
  max: 1,
});

// Throttle penambahan reaksi per user+pesan.
const reactionLimiter = createFixedWindowLimiter({
  windowMs: env.reactionThrottleMs,
  max: 1,
});

// Throttle star/unstar per user.
const starLimiter = createFixedWindowLimiter({
  windowMs: env.starThrottleMs,
  max: 1,
});

// Bersihkan bucket kedaluwarsa semua limiter secara berkala.
const pruneInterval = setInterval(() => {
  seenLimiter.prune();
  pinLimiter.prune();
  reactionLimiter.prune();
  starLimiter.prune();
}, 60_000);
// unref agar interval prune tidak menahan proses Node tetap hidup.
pruneInterval.unref();

/**
 * Mengelompokkan seluruh reaksi sebuah pesan berdasarkan emoji.
 * @returns Daftar `{ emoji, userIds }` siap dikirim ke client.
 */
async function groupReactions(messageId: string) {
  const rows = await findReactionsByMessage(messageId);
  const byEmoji = new Map<string, string[]>();
  for (const row of rows) {
    const userIds = byEmoji.get(row.emoji) ?? [];
    userIds.push(row.userId);
    byEmoji.set(row.emoji, userIds);
  }
  return [...byEmoji.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
}

/**
 * Mendaftarkan seluruh listener event pesan untuk satu socket: message:send,
 * message:seen, message:delete, message:pin/unpin, message:star/unstar, dan
 * message:reaction:add/remove.
 */
export function setupMessageHandlers(io: Server, socket: Socket) {
  const userId = (socket as Socket & { userId: string }).userId;

  socket.on(
    'message:send',
    async (data: { conversationId: string; content: string; replyToId?: string }, callback) => {
      try {
        if (!messageRateLimiter.allow(userId)) {
          callback?.({ error: 'Rate limit exceeded. Please slow down.' });
          return;
        }

        const parsed = sendMessageSchema.safeParse(data);
        if (!parsed.success) {
          callback?.({ error: 'Invalid message payload', details: parsed.error.flatten() });
          return;
        }
        const { conversationId, content, replyToId } = parsed.data;

        const [membership] = await db
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

        if (!membership) {
          callback?.({ error: 'Not a member of this conversation' });
          return;
        }

        if (await isBlockedByAnyMember(conversationId, userId)) {
          callback?.({ error: 'You are blocked by a member of this conversation' });
          return;
        }

        if (
          membership.conversationType === 'PRIVATE' &&
          (await hasBlockedAnyMember(conversationId, userId))
        ) {
          callback?.({ error: 'You have blocked a member of this conversation' });
          return;
        }

        if (replyToId) {
          const [replyMessage] = await db
            .select({ id: messages.id })
            .from(messages)
            .where(and(eq(messages.id, replyToId), eq(messages.conversationId, conversationId)))
            .limit(1);

          if (!replyMessage) {
            callback?.({ error: 'Replied message not found in this conversation' });
            return;
          }
        }

        const now = new Date();
        // Simpan pesan + status awal seluruh penerima dalam satu transaksi.
        // Status tiap penerima dihitung dari ranking SEEN > DELIVERED > SENT
        // (lihat computeRecipientStatus) agar tidak ada status palsu.
        const { message, members, recipientRows } = await db.transaction(async (tx) => {
          const [message] = await tx
            .insert(messages)
            .values({
              conversationId,
              senderId: userId,
              content,
              type: 'TEXT',
              replyToId: replyToId || null,
            })
            .returning();

          await tx.insert(messageStatus).values({
            messageId: message.id,
            userId,
            status: 'SENT',
          });

          const members = await tx
            .select({
              userId: conversationMembers.userId,
              mutedUntil: conversationMembers.mutedUntil,
            })
            .from(conversationMembers)
            .where(eq(conversationMembers.conversationId, conversationId));

          const recipientRows = members
            .filter((member) => member.userId !== userId)
            .map((member) => {
              const status = computeRecipientStatus(conversationId, member.userId);
              return {
                messageId: message.id,
                userId: member.userId,
                status,
                ...(status === 'SEEN' ? { seenAt: now } : {}),
              };
            });

          if (recipientRows.length > 0) {
            await tx.insert(messageStatus).values(recipientRows);
          }

          // Pesan baru otomatis memunculkan kembali percakapan yang
          // disembunyikan, baik bagi pengirim maupun penerima.
          await tx
            .update(conversationMembers)
            .set({ hiddenAt: null })
            .where(
              and(
                eq(conversationMembers.conversationId, conversationId),
                inArray(conversationMembers.userId, [
                  userId,
                  ...recipientRows.map((row) => row.userId),
                ]),
              ),
            );

          return { message, members, recipientRows };
        });

        // Tidak ada emit message:status awal; rekap status awal dilekatkan
        // ke payload sehingga ack message:send dan broadcast message:new
        // sudah membawa centang yang benar sejak detik pertama. Event
        // agregat menyusul saat status berubah (mis. SEEN lengkap).
        const senderUser = await findUserById(userId);
        const messagePayload = {
          ...message,
          sender: toSender(senderUser),
          ...buildInitialReceipt(recipientRows),
        };

        io.to(`conversation:${conversationId}`).emit('message:new', messagePayload);

        if (membership.conversationType === 'GROUP') {
          try {
            await notifyConversationMentions({
              conversationId,
              messageId: message.id,
              actorId: userId,
              content,
              recipients: recipientRows,
            });
          } catch {
            // Kegagalan notifikasi tidak boleh menggagalkan pengiriman pesan.
          }
        }

        callback?.({ data: messagePayload });

        // Push notifikasi hanya untuk penerima yang benar-benar offline
        // (status masih SENT).
        const offlineTargets = recipientRows
          .filter((row) => row.status === 'SENT')
          .map((row) => ({
            userId: row.userId,
            mutedUntil: members.find((m) => m.userId === row.userId)?.mutedUntil ?? null,
          }));

        if (offlineTargets.length > 0) {
          void sendIncomingPush({
            conversationId,
            conversationType: membership.conversationType,
            conversationName: membership.conversationName,
            messageId: message.id,
            senderId: userId,
            senderName: senderUser?.fullName || senderUser?.username || userId,
            content,
            targets: offlineTargets,
          });
        }
      } catch {
        callback?.({ error: 'Failed to send message' });
      }
    },
  );

  socket.on(
    'message:seen',
    async (
      data: { conversationId: string; lastSeenMessageId: string },
      callback?: (response: unknown) => void,
    ) => {
      try {
        const parsed = messageSeenSchema.safeParse(data);
        if (!parsed.success) {
          callback?.({ error: 'Invalid message:seen payload' });
          return;
        }
        const { conversationId, lastSeenMessageId } = parsed.data;

        // Event seen di-throttle per user+percakapan; saat dibatasi, balas
        // ack kosong (bukan error) agar client tidak menganggapnya gagal.
        if (!seenLimiter.allow(`${userId}:${conversationId}`)) {
          callback?.({ data: { updated: 0 } });
          return;
        }

        const membership = await db
          .select()
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, conversationId),
              eq(conversationMembers.userId, userId),
            ),
          )
          .limit(1);

        if (membership.length === 0) {
          callback?.({ error: 'Not a member of this conversation' });
          return;
        }

        const [lastSeenMessage] = await db
          .select({ id: messages.id, createdAt: messages.createdAt })
          .from(messages)
          .where(
            and(eq(messages.id, lastSeenMessageId), eq(messages.conversationId, conversationId)),
          )
          .limit(1);

        if (!lastSeenMessage) {
          callback?.({ error: 'Message not found in this conversation' });
          return;
        }

        // Kumpulkan id pesan milik pengirim lain yang dibuat sebelum/sama
        // dengan pesan acuan; semuanya dianggap terbaca sekaligus.
        const now = new Date();
        const targetIds = (
          await db
            .select({ id: messages.id })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, conversationId),
                sql`${messages.createdAt} <= (SELECT created_at FROM messages WHERE id = ${lastSeenMessageId})`,
                ne(messages.senderId, userId),
              ),
            )
        ).map((row) => row.id);

        if (targetIds.length === 0) {
          callback?.({ data: { updated: 0, seenAt: null } });
          return;
        }

        const existingRows = await db
          .select({ messageId: messageStatus.messageId })
          .from(messageStatus)
          .where(
            and(eq(messageStatus.userId, userId), inArray(messageStatus.messageId, targetIds)),
          );
        const existingIds = new Set(existingRows.map((row) => row.messageId));

        const updated = await db
          .update(messageStatus)
          .set({
            status: 'SEEN',
            seenAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(messageStatus.userId, userId),
              ne(messageStatus.status, 'SEEN'),
              inArray(messageStatus.messageId, [...existingIds]),
            ),
          )
          .returning({ messageId: messageStatus.messageId });

        // Pesan lama yang belum punya baris status dibuat langsung SEEN
        // lewat upsert agar tidak ada pesan yang terlewat.
        const newIds = targetIds.filter((id) => !existingIds.has(id));
        if (newIds.length > 0) {
          await db
            .insert(messageStatus)
            .values(
              newIds.map((id) => ({
                messageId: id,
                userId,
                status: 'SEEN' as const,
                seenAt: now,
                updatedAt: now,
              })),
            )
            .onConflictDoUpdate({
              target: [messageStatus.messageId, messageStatus.userId],
              set: { status: 'SEEN', seenAt: now, updatedAt: now },
            });
        }

        const changedIds = [...new Set([...updated.map((row) => row.messageId), ...newIds])];
        const seenAt = now.toISOString();

        // Event SEEN agregat hanya saat pembaca ini melengkapi semua
        // anggota lain (semantik centang biru ala WhatsApp).
        if (changedIds.length > 0) {
          const completion = await findMessageReadCompletion(changedIds);
          for (const row of completion) {
            if (row.seenOthers >= row.otherMembers && row.otherMembers > 0) {
              io.to(`user:${row.senderId}`).emit('message:status', {
                messageId: row.messageId,
                status: 'SEEN',
                seenAt,
              });
            }
          }
        }

        callback?.({ data: { updated: changedIds.length, seenAt } });
      } catch {
        callback?.({ error: 'Failed to update message status' });
      }
    },
  );

  socket.on(
    'message:delete',
    async (data: { conversationId: string; messageId: string }, callback) => {
      try {
        const [message] = await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.id, data.messageId),
              eq(messages.senderId, userId),
              eq(messages.conversationId, data.conversationId),
            ),
          )
          .limit(1);

        if (!message) {
          callback?.({ error: 'Message not found or unauthorized' });
          return;
        }
        if (message.type === 'SYSTEM') {
          callback?.({ error: 'Cannot delete a system message' });
          return;
        }

        const [membership] = await db
          .select({ id: conversationMembers.id })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, data.conversationId),
              eq(conversationMembers.userId, userId),
            ),
          )
          .limit(1);

        if (!membership) {
          callback?.({ error: 'Not a member of this conversation' });
          return;
        }

        // Hapus lembut: konten dikosongkan, baris pesan dipertahankan.
        await db
          .update(messages)
          .set({ isDeleted: true, content: '' })
          .where(eq(messages.id, data.messageId));

        // File fisik hanya dihapus bila tidak lagi direferensikan pesan lain
        // (mis. pesan hasil forward yang berbagi fileUrl yang sama).
        if (message.fileUrl && (await countMessageFileReferences(message.fileUrl)) === 0) {
          const filename = message.fileUrl.split('/').pop();
          if (filename) {
            await unlinkQuietly(path.join(env.uploadDir, filename));
          }
        }

        io.to(`conversation:${data.conversationId}`).emit('message:deleted', {
          messageId: data.messageId,
          conversationId: data.conversationId,
        });

        callback?.({ data: { messageId: data.messageId } });
      } catch {
        callback?.({ error: 'Failed to delete message' });
      }
    },
  );

  /**
   * Memvalidasi lalu mengubah status pin sebuah pesan dan menyiarkan hasil
   * ke seluruh anggota percakapan. Dipakai bersama oleh pin dan unpin.
   */
  const setMessagePinned = async (
    messageId: string,
    isPinned: boolean,
    callback?: (response: unknown) => void,
  ) => {
    try {
      const [message] = await db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          isDeleted: messages.isDeleted,
          type: messages.type,
        })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message) {
        callback?.({ error: 'Message not found' });
        return;
      }

      const [membership] = await db
        .select({ id: conversationMembers.id })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, message.conversationId),
            eq(conversationMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership) {
        callback?.({ error: 'Not a member of this conversation' });
        return;
      }

      if (message.isDeleted && isPinned) {
        callback?.({ error: 'Cannot pin a deleted message' });
        return;
      }

      if (message.type === 'SYSTEM' && isPinned) {
        callback?.({ error: 'Cannot pin a system message' });
        return;
      }

      await updateMessagePinned(messageId, isPinned);

      io.to(`conversation:${message.conversationId}`).emit('message:pin:updated', {
        conversationId: message.conversationId,
        messageId,
        isPinned,
      });

      callback?.({ data: { messageId, isPinned } });
    } catch {
      callback?.({ error: 'Failed to update message pin' });
    }
  };

  socket.on('message:pin', (data: { messageId: string }, callback) => {
    if (!pinLimiter.allow(userId)) {
      callback?.({ error: 'Rate limit exceeded. Please slow down.' });
      return;
    }

    const parsed = pinMessageSchema.safeParse(data);
    if (!parsed.success) {
      callback?.({ error: 'Invalid message:pin payload' });
      return;
    }
    void setMessagePinned(parsed.data.messageId, true, callback);
  });

  socket.on('message:unpin', (data: { messageId: string }, callback) => {
    if (!pinLimiter.allow(userId)) {
      callback?.({ error: 'Rate limit exceeded. Please slow down.' });
      return;
    }

    const parsed = pinMessageSchema.safeParse(data);
    if (!parsed.success) {
      callback?.({ error: 'Invalid message:unpin payload' });
      return;
    }
    void setMessagePinned(parsed.data.messageId, false, callback);
  });

  /**
   * Memproses star/unstar pesan (privat per user), lalu mengirim konfirmasi
   * hanya ke user terkait, bukan ke seluruh room.
   */
  const handleStar = async (
    data: { messageId: string },
    star: boolean,
    callback?: (response: unknown) => void,
  ) => {
    try {
      if (!starLimiter.allow(userId)) {
        callback?.({ error: 'Rate limit exceeded. Please slow down.' });
        return;
      }

      const parsed = pinMessageSchema.safeParse(data);
      if (!parsed.success) {
        callback?.({
          error: star ? 'Invalid message:star payload' : 'Invalid message:unstar payload',
        });
        return;
      }
      const { messageId } = parsed.data;

      const [message] = await db
        .select({
          conversationId: messages.conversationId,
          type: messages.type,
          isDeleted: messages.isDeleted,
        })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message) {
        callback?.({ error: 'Message not found' });
        return;
      }

      const [membership] = await db
        .select({ id: conversationMembers.id })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, message.conversationId),
            eq(conversationMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership) {
        callback?.({ error: 'Not a member of this conversation' });
        return;
      }

      if (star && message.isDeleted) {
        callback?.({ error: 'Cannot star a deleted message' });
        return;
      }
      if (star && message.type === 'SYSTEM') {
        callback?.({ error: 'Cannot star a system message' });
        return;
      }

      if (star) {
        await addStar(messageId, userId);
      } else {
        await removeStar(messageId, userId);
      }

      const starredAt = star ? new Date().toISOString() : null;
      io.to(`user:${userId}`).emit('message:star:updated', {
        messageId,
        isStarred: star,
        starredAt,
      });

      callback?.({ data: { messageId, isStarred: star, starredAt } });
    } catch {
      callback?.({ error: 'Failed to update message star' });
    }
  };

  socket.on('message:star', (data: { messageId: string }, callback) => {
    void handleStar(data, true, callback);
  });

  socket.on('message:unstar', (data: { messageId: string }, callback) => {
    void handleStar(data, false, callback);
  });

  // Kelompokkan ulang reaksi pesan lalu siarkan ke seluruh room percakapan.
  const emitReactions = (conversationId: string, messageId: string) =>
    groupReactions(messageId).then((reactions) => {
      io.to(`conversation:${conversationId}`).emit('message:reaction:updated', {
        messageId,
        reactions,
      });
      return reactions;
    });

  socket.on(
    'message:reaction:add',
    async (data: { messageId: string; emoji: string }, callback?: (response: unknown) => void) => {
      try {
        if (!reactionLimiter.allow(`${userId}:${data.messageId}`)) {
          callback?.({ error: 'Rate limit exceeded. Please slow down.' });
          return;
        }

        const parsed = reactionSchema.safeParse(data);
        if (!parsed.success) {
          callback?.({ error: 'Invalid message:reaction:add payload' });
          return;
        }
        const { messageId, emoji } = parsed.data;

        const [message] = await db
          .select({ conversationId: messages.conversationId })
          .from(messages)
          .where(eq(messages.id, messageId))
          .limit(1);

        if (!message) {
          callback?.({ error: 'Message not found' });
          return;
        }

        const [membership] = await db
          .select({ id: conversationMembers.id })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, message.conversationId),
              eq(conversationMembers.userId, userId),
            ),
          )
          .limit(1);

        if (!membership) {
          callback?.({ error: 'Not a member of this conversation' });
          return;
        }

        if (await findReaction(messageId, userId, emoji)) {
          callback?.({ error: 'Reaction already exists' });
          return;
        }

        await addReaction(messageId, userId, emoji);
        const reactions = await emitReactions(message.conversationId, messageId);
        callback?.({ data: { reactions } });
      } catch {
        callback?.({ error: 'Failed to add reaction' });
      }
    },
  );

  socket.on(
    'message:reaction:remove',
    async (data: { messageId: string; emoji: string }, callback?: (response: unknown) => void) => {
      try {
        const parsed = reactionSchema.safeParse(data);
        if (!parsed.success) {
          callback?.({ error: 'Invalid message:reaction:remove payload' });
          return;
        }
        const { messageId, emoji } = parsed.data;

        const [message] = await db
          .select({ conversationId: messages.conversationId })
          .from(messages)
          .where(eq(messages.id, messageId))
          .limit(1);

        if (!message) {
          callback?.({ error: 'Message not found' });
          return;
        }

        const [membership] = await db
          .select({ id: conversationMembers.id })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, message.conversationId),
              eq(conversationMembers.userId, userId),
            ),
          )
          .limit(1);

        if (!membership) {
          callback?.({ error: 'Not a member of this conversation' });
          return;
        }

        await removeReaction(messageId, userId, emoji);
        const reactions = await emitReactions(message.conversationId, messageId);
        callback?.({ data: { reactions } });
      } catch {
        callback?.({ error: 'Failed to remove reaction' });
      }
    },
  );
}

/**
 * Catch-up delivery saat reconnect: mengubah seluruh status SENT yang
 * tertunda milik user menjadi DELIVERED, lalu memberi tahu pengirim lewat
 * event message:status agregat (tanpa userId; DELIVERED cukup sekali karena
 * ambangnya "minimal satu penerima"). Dipanggil saat socket pertama user
 * terhubung.
 */
export async function catchUpMessageDelivery(io: Server, userId: string) {
  try {
    const pending = await db
      .select({
        messageId: messageStatus.messageId,
        senderId: messages.senderId,
      })
      .from(messageStatus)
      .innerJoin(messages, eq(messages.id, messageStatus.messageId))
      .where(
        and(
          eq(messageStatus.userId, userId),
          eq(messageStatus.status, 'SENT'),
          ne(messages.senderId, userId),
        ),
      );

    if (pending.length === 0) return;

    const now = new Date();
    await db
      .update(messageStatus)
      .set({ status: 'DELIVERED', updatedAt: now })
      .where(
        and(
          eq(messageStatus.userId, userId),
          eq(messageStatus.status, 'SENT'),
          inArray(
            messageStatus.messageId,
            pending.map((row) => row.messageId),
          ),
        ),
      );

    for (const { messageId, senderId } of pending) {
      io.to(`user:${senderId}`).emit('message:status', {
        messageId,
        status: 'DELIVERED',
        seenAt: null,
      });
    }
  } catch (err) {
    console.error(`Failed to deliver pending SENT messages for user ${userId}:`, err);
  }
}

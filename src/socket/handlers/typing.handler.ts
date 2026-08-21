/**
 * Handler event indikator mengetik (typing:start / typing:stop) via Socket.IO.
 * Memvalidasi payload, melakukan throttle per user dan percakapan,
 * memastikan pengirim masih anggota, lalu menyiarkan event ke anggota lain
 * dengan menyaring relasi blokir.
 */
import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { eq, and, ne } from 'drizzle-orm';
import { env } from '../../config/env';
import db from '../../db/index';
import { createFixedWindowLimiter } from '../rateLimit';
import { findConversationMembership } from '../../modules/conversations/conversations.repository';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { getBlockRelationUserIds } from '../../modules/users/blockedUsers.repository';

const typingPayloadSchema = z.object({
  conversationId: z.string().uuid(),
});

// Throttle agar client bebas mengirim event kapan pun tanpa membanjiri broadcast.
const typingLimiter = createFixedWindowLimiter({
  windowMs: env.typingThrottleMs,
  max: 1,
});

// Limiter terpisah supaya typing:start dan typing:stop tidak saling
// menghabiskan kuota satu sama lain.
const typingStopLimiter = createFixedWindowLimiter({
  windowMs: env.typingThrottleMs,
  max: 1,
});

const pruneInterval = setInterval(() => {
  typingLimiter.prune();
  typingStopLimiter.prune();
}, 60_000);
pruneInterval.unref();

/** Cek keanggotaan percakapan; kegagalan query diperlakukan bukan anggota. */
async function isConversationMember(conversationId: string, userId: string) {
  try {
    return (await findConversationMembership(conversationId, userId)) !== null;
  } catch {
    return false;
  }
}

/**
 * Menyiarkan event typing ke seluruh anggota percakapan lain, kecuali user
 * yang memiliki relasi blokir dengan pengirim.
 */
async function broadcastTyping(
  io: Server,
  userId: string,
  conversationId: string,
  event: 'typing:start' | 'typing:stop',
) {
  try {
    const members = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          ne(conversationMembers.userId, userId),
        ),
      );
    const blockedIds = await getBlockRelationUserIds(userId);
    for (const member of members) {
      if (blockedIds.has(member.userId)) continue;
      io.to(`user:${member.userId}`).emit(event, { conversationId, userId });
    }
  } catch (err) {
    console.error(`Failed to broadcast ${event} for user ${userId}:`, err);
  }
}

/** Mendaftarkan listener `typing:start` dan `typing:stop` untuk satu socket. */
export function setupTypingHandlers(io: Server, socket: Socket) {
  const userId = (socket as Socket & { userId: string }).userId;

  socket.on('typing:start', async (data: { conversationId: string }) => {
    if (!typingPayloadSchema.safeParse(data).success) return;

    if (!typingLimiter.allow(`${userId}:${data.conversationId}`)) return;

    if (!(await isConversationMember(data.conversationId, userId))) return;

    void broadcastTyping(io, userId, data.conversationId, 'typing:start');
  });

  socket.on('typing:stop', async (data: { conversationId: string }) => {
    if (!typingPayloadSchema.safeParse(data).success) return;

    if (!typingStopLimiter.allow(`${userId}:${data.conversationId}`)) return;

    if (!(await isConversationMember(data.conversationId, userId))) return;

    void broadcastTyping(io, userId, data.conversationId, 'typing:stop');
  });
}

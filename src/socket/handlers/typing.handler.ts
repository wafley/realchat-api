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

const typingLimiter = createFixedWindowLimiter({
  windowMs: env.typingThrottleMs,
  max: 1,
});

const typingStopLimiter = createFixedWindowLimiter({
  windowMs: env.typingThrottleMs,
  max: 1,
});

const pruneInterval = setInterval(() => {
  typingLimiter.prune();
  typingStopLimiter.prune();
}, 60_000);
pruneInterval.unref();

async function isConversationMember(conversationId: string, userId: string) {
  try {
    return (await findConversationMembership(conversationId, userId)) !== null;
  } catch {
    return false;
  }
}

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

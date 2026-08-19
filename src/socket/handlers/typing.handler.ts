import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { env } from '../../config/env';
import { createFixedWindowLimiter } from '../rateLimit';
import { findConversationMembership } from '../../modules/conversations/conversations.repository';

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

export function setupTypingHandlers(io: Server, socket: Socket) {
  const userId = (socket as Socket & { userId: string }).userId;

  socket.on('typing:start', async (data: { conversationId: string }) => {
    if (!typingPayloadSchema.safeParse(data).success) return;

    if (!typingLimiter.allow(`${userId}:${data.conversationId}`)) return;

    if (!(await isConversationMember(data.conversationId, userId))) return;

    socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
      conversationId: data.conversationId,
      userId,
    });
  });

  socket.on('typing:stop', async (data: { conversationId: string }) => {
    if (!typingPayloadSchema.safeParse(data).success) return;

    if (!typingStopLimiter.allow(`${userId}:${data.conversationId}`)) return;

    if (!(await isConversationMember(data.conversationId, userId))) return;

    socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
      conversationId: data.conversationId,
      userId,
    });
  });
}

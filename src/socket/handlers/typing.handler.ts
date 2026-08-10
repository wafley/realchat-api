import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { env } from '../../config/env';
import { createFixedWindowLimiter } from '../rateLimit';

const typingPayloadSchema = z.object({
  conversationId: z.string().uuid(),
});

const typingLimiter = createFixedWindowLimiter({
  windowMs: env.typingThrottleMs,
  max: 1,
});

const pruneInterval = setInterval(() => typingLimiter.prune(), 60_000);
pruneInterval.unref();

export function setupTypingHandlers(io: Server, socket: Socket) {
  const userId = (socket as Socket & { userId: string }).userId;

  socket.on('typing:start', (data: { conversationId: string }) => {
    if (!typingPayloadSchema.safeParse(data).success) return;

    if (!typingLimiter.allow(`${userId}:${data.conversationId}`)) return;

    socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
      conversationId: data.conversationId,
      userId,
    });
  });

  socket.on('typing:stop', (data: { conversationId: string }) => {
    if (!typingPayloadSchema.safeParse(data).success) return;

    socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
      conversationId: data.conversationId,
      userId,
    });
  });
}

import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { env } from '../../config/env';
import { createFixedWindowLimiter } from '../rateLimit';
import { addActiveViewer, removeActiveViewer } from '../activeViewers';
import { markConversationAsRead } from '../../modules/conversations/conversations.service';

const activityPayloadSchema = z.object({
  conversationId: z.string().uuid(),
});

const backLimiter = createFixedWindowLimiter({
  windowMs: env.seenThrottleMs,
  max: 1,
});

const pruneInterval = setInterval(() => {
  backLimiter.prune();
}, 60_000);
pruneInterval.unref();

export function setupActivityHandlers(_io: Server, socket: Socket) {
  const userId = (socket as Socket & { userId: string }).userId;

  socket.on('user-away', (data: { conversationId: string }) => {
    if (!activityPayloadSchema.safeParse(data).success) return;
    removeActiveViewer(socket.id, userId, data.conversationId);
  });

  socket.on('user-back', async (data: { conversationId: string }) => {
    if (!activityPayloadSchema.safeParse(data).success) return;
    const { conversationId } = data;

    addActiveViewer(socket.id, userId, conversationId);

    if (!backLimiter.allow(`${userId}:${conversationId}`)) return;

    try {
      await markConversationAsRead(userId, conversationId);
    } catch {
      return;
    }
  });
}

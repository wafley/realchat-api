/**
 * Handler event aktivitas penampil chat (user-away / user-back) via
 * Socket.IO. Memelihara daftar viewer aktif per percakapan dan menandai
 * percakapan sebagai dibaca ketika user kembali membuka chat.
 */
import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { env } from '../../config/env';
import { createFixedWindowLimiter } from '../rateLimit';
import { addActiveViewer, removeActiveViewer } from '../activeViewers';
import { markConversationAsRead } from '../../modules/conversations/conversations.service';

const activityPayloadSchema = z.object({
  conversationId: z.string().uuid(),
});

// Throttle tulis DB untuk user-back agar tidak dieksekusi pada tiap event.
const backLimiter = createFixedWindowLimiter({
  windowMs: env.seenThrottleMs,
  max: 1,
});

const pruneInterval = setInterval(() => {
  backLimiter.prune();
}, 60_000);
pruneInterval.unref();

/** Mendaftarkan listener `user-away` dan `user-back` untuk satu socket. */
export function setupActivityHandlers(_io: Server, socket: Socket) {
  const userId = (socket as Socket & { userId: string }).userId;

  socket.on('user-away', (data: { conversationId: string }) => {
    if (!activityPayloadSchema.safeParse(data).success) return;
    removeActiveViewer(socket.id, userId, data.conversationId);
  });

  socket.on('user-back', async (data: { conversationId: string }) => {
    if (!activityPayloadSchema.safeParse(data).success) return;
    const { conversationId } = data;

    // Status viewer selalu diperbarui agar status SEEN real-time tetap akurat.
    addActiveViewer(socket.id, userId, conversationId);

    // Tulis DB (tandai percakapan dibaca) di-throttle per user+percakapan;
    // event yang dibatasi tetap memperbarui viewer di atas.
    if (!backLimiter.allow(`${userId}:${conversationId}`)) return;

    try {
      await markConversationAsRead(userId, conversationId, { before: new Date() });
    } catch {
      return;
    }
  });
}

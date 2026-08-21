/**
 * Handler event keanggotaan room percakapan (group:join / group:leave) via
 * Socket.IO. Dipakai client untuk bergabung kembali ke room saat chat dibuka
 * (mis. setelah disembunyikan), atau keluar room saat chat ditutup.
 */
import { Socket } from 'socket.io';
import db from '../../db/index';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { eq, and } from 'drizzle-orm';

/** Mendaftarkan listener `group:join` dan `group:leave` untuk satu socket. */
export function setupGroupHandlers(socket: Socket) {
  const userId = (socket as Socket & { userId: string }).userId;

  socket.on('group:join', async (data: { conversationId: string }, callback) => {
    try {
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

      // Join ulang room agar broadcast percakapan kembali diterima client.
      socket.join(`conversation:${data.conversationId}`);
      callback?.({ data: { conversationId: data.conversationId } });
    } catch {
      callback?.({ error: 'Failed to join conversation' });
    }
  });

  // Keluar room tanpa validasi keanggotaan; efeknya hanya berhenti menerima
  // broadcast, aman karena keanggotaan room bukan sumber otorisasi.
  socket.on('group:leave', (data: { conversationId: string }) => {
    socket.leave(`conversation:${data.conversationId}`);
  });
}

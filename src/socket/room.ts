/**
 * Utilitas manajemen room Socket.IO. Dipanggil dari lapisan service saat
 * state percakapan berubah dan keanggotaan room perlu disesuaikan paksa.
 */
import { getIO } from './index';

/**
 * Mengeluarkan semua socket milik seorang user dari room percakapan.
 * @param userId - Pemilik socket yang akan dikeluarkan dari room.
 * @param conversationId - Percakapan yang roomnya ditinggalkan paksa.
 */
export async function forceLeaveConversationRoom(userId: string, conversationId: string) {
  const sockets = await getIO().in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    socket.leave(`conversation:${conversationId}`);
  }
}

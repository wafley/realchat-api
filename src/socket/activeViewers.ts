/**
 * Pelacak viewer aktif per percakapan dalam memori. Menjadi dasar penentuan
 * status pesan SEEN/DELIVERED/SENT serta event aktivitas user-away/user-back.
 */
import { onlineUsers } from './onlineUsers';

// Map bersarang: conversationId -> userId -> himpunan socket.id. Satu user
// bisa membuka chat dari beberapa tab/perangkat sekaligus, sehingga user
// dianggap berhenti melihat hanya setelah semua socket-nya dilepas.
const activeViewers = new Map<string, Map<string, Set<string>>>();
// Reverse map socket.id -> himpunan conversationId yang sedang dilihat,
// agar cleanup saat disconnect cukup membaca map ini tanpa memindai
// seluruh isi activeViewers.
const socketRooms = new Map<string, Set<string>>();

/** Mencatat sebuah socket sebagai viewer aktif pada percakapan tertentu. */
export function addActiveViewer(socketId: string, userId: string, conversationId: string) {
  let byUser = activeViewers.get(conversationId);
  if (!byUser) {
    byUser = new Map();
    activeViewers.set(conversationId, byUser);
  }
  let socketIds = byUser.get(userId);
  if (!socketIds) {
    socketIds = new Set();
    byUser.set(userId, socketIds);
  }
  socketIds.add(socketId);

  let rooms = socketRooms.get(socketId);
  if (!rooms) {
    rooms = new Set();
    socketRooms.set(socketId, rooms);
  }
  rooms.add(conversationId);
}

/**
 * Melepas satu socket dari daftar viewer percakapan lalu merapikan map
 * induk yang telah kosong agar struktur data tidak membengkak.
 */
export function removeActiveViewer(socketId: string, userId: string, conversationId: string) {
  const byUser = activeViewers.get(conversationId);
  if (!byUser) return;
  const socketIds = byUser.get(userId);
  if (!socketIds) return;
  socketIds.delete(socketId);
  if (socketIds.size === 0) byUser.delete(userId);
  if (byUser.size === 0) activeViewers.delete(conversationId);

  const rooms = socketRooms.get(socketId);
  if (rooms) {
    rooms.delete(conversationId);
    if (rooms.size === 0) socketRooms.delete(socketId);
  }
}

/** Menghapus seluruh jejak viewer milik satu socket; dipanggil saat disconnect. */
export function clearSocketActiveViewers(socketId: string) {
  const rooms = socketRooms.get(socketId);
  if (!rooms) return;
  for (const conversationId of rooms) {
    const byUser = activeViewers.get(conversationId);
    if (!byUser) continue;
    for (const [userId, socketIds] of byUser) {
      if (socketIds.delete(socketId) && socketIds.size === 0) byUser.delete(userId);
    }
    if (byUser.size === 0) activeViewers.delete(conversationId);
  }
  socketRooms.delete(socketId);
}

/** Mengecek apakah user sedang membuka (menjadi viewer) percakapan tersebut. */
export function isActiveViewer(conversationId: string, userId: string): boolean {
  return (activeViewers.get(conversationId)?.get(userId)?.size ?? 0) > 0;
}

/**
 * Menentukan status awal pesan bagi seorang penerima memakai ranking
 * SEEN > DELIVERED > SENT: SEEN bila user sedang membuka chat, DELIVERED
 * bila punya koneksi socket aktif, dan SENT bila hanya tersimpan di server.
 */
export function computeRecipientStatus(
  conversationId: string,
  recipientId: string,
): 'SEEN' | 'DELIVERED' | 'SENT' {
  if (isActiveViewer(conversationId, recipientId)) return 'SEEN';
  if (onlineUsers.get(recipientId)?.size) return 'DELIVERED';
  return 'SENT';
}

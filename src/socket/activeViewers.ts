import { onlineUsers } from './onlineUsers';

const activeViewers = new Map<string, Map<string, Set<string>>>();
const socketRooms = new Map<string, Set<string>>();

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

export function isActiveViewer(conversationId: string, userId: string): boolean {
  return (activeViewers.get(conversationId)?.get(userId)?.size ?? 0) > 0;
}

export function computeRecipientStatus(
  conversationId: string,
  recipientId: string,
): 'SEEN' | 'DELIVERED' | 'SENT' {
  if (isActiveViewer(conversationId, recipientId)) return 'SEEN';
  if (onlineUsers.get(recipientId)?.size) return 'DELIVERED';
  return 'SENT';
}

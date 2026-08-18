import { getIO } from './index';

export async function forceLeaveConversationRoom(userId: string, conversationId: string) {
  const sockets = await getIO().in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    socket.leave(`conversation:${conversationId}`);
  }
}

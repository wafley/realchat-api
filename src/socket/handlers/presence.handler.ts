import { Server, Socket } from 'socket.io';
import db from '../../db/index';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { eq } from 'drizzle-orm';
import { onlineUsers } from '../onlineUsers';

export async function setupPresenceHandlers(io: Server, socket: Socket) {
  const userId = (socket as Socket & { userId: string }).userId;

  const userConversations = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId)!.add(socket.id);

  if (onlineUsers.get(userId)!.size === 1) {
    for (const conv of userConversations) {
      io.to(`conversation:${conv.conversationId}`).emit('presence:online', { userId });
    }
  }

  socket.on('disconnect', () => {
    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
        for (const conv of userConversations) {
          io.to(`conversation:${conv.conversationId}`).emit('presence:offline', { userId });
        }
      }
    }
  });
}

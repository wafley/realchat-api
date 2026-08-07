import { Socket } from 'socket.io';
import db from '../../db/index';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { eq, and } from 'drizzle-orm';

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

      socket.join(`conversation:${data.conversationId}`);
      callback?.({ data: { conversationId: data.conversationId } });
    } catch {
      callback?.({ error: 'Failed to join conversation' });
    }
  });

  socket.on('group:leave', (data: { conversationId: string }) => {
    socket.leave(`conversation:${data.conversationId}`);
  });
}

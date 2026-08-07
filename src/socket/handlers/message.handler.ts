import { Server, Socket } from 'socket.io';
import db from '../../db/index';
import { messages } from '../../db/schema/messages';
import { messageStatus } from '../../db/schema/messageStatus';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { eq, and } from 'drizzle-orm';

export function setupMessageHandlers(io: Server, socket: Socket) {
  const userId = (socket as Socket & { userId: string }).userId;

  socket.on(
    'message:send',
    async (data: { conversationId: string; content: string; replyToId?: string }, callback) => {
      try {
        const membership = await db
          .select()
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, data.conversationId),
              eq(conversationMembers.userId, userId),
            ),
          )
          .limit(1);

        if (membership.length === 0) {
          callback?.({ error: 'Not a member of this conversation' });
          return;
        }

        if (data.replyToId) {
          const [replyMessage] = await db
            .select({ id: messages.id })
            .from(messages)
            .where(
              and(
                eq(messages.id, data.replyToId),
                eq(messages.conversationId, data.conversationId),
              ),
            )
            .limit(1);

          if (!replyMessage) {
            callback?.({ error: 'Replied message not found in this conversation' });
            return;
          }
        }

        const [message] = await db
          .insert(messages)
          .values({
            conversationId: data.conversationId,
            senderId: userId,
            content: data.content,
            type: 'TEXT',
            replyToId: data.replyToId,
          })
          .returning();

        await db.insert(messageStatus).values({
          messageId: message.id,
          userId,
          status: 'SENT',
        });

        io.to(`conversation:${data.conversationId}`).emit('message:new', message);
        callback?.({ data: message });
      } catch {
        callback?.({ error: 'Failed to send message' });
      }
    },
  );

  socket.on(
    'message:delete',
    async (data: { conversationId: string; messageId: string }, callback) => {
      try {
        const [message] = await db
          .select()
          .from(messages)
          .where(and(eq(messages.id, data.messageId), eq(messages.senderId, userId)))
          .limit(1);

        if (!message) {
          callback?.({ error: 'Message not found or unauthorized' });
          return;
        }

        await db
          .update(messages)
          .set({ isDeleted: true, content: '' })
          .where(eq(messages.id, data.messageId));

        io.to(`conversation:${data.conversationId}`).emit('message:deleted', {
          messageId: data.messageId,
          conversationId: data.conversationId,
        });

        callback?.({ data: { messageId: data.messageId } });
      } catch {
        callback?.({ error: 'Failed to delete message' });
      }
    },
  );
}

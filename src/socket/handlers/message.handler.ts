import { Server, Socket } from 'socket.io';
import db from '../../db/index';
import { messages } from '../../db/schema/messages';
import { messageStatus } from '../../db/schema/messageStatus';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { eq, and, ne, sql, inArray } from 'drizzle-orm';
import {
  sendMessageSchema,
  messageSeenSchema,
  pinMessageSchema,
} from '../../modules/conversations/conversations.validator';
import { updateMessagePinned } from '../../modules/conversations/conversations.repository';
import { env } from '../../config/env';
import { createMessageRateLimiter, createFixedWindowLimiter } from '../rateLimit';
import { onlineUsers } from '../onlineUsers';

const messageRateLimiter = createMessageRateLimiter({
  perSecond: env.messageRatePerSecond,
  perMinute: env.messageRatePerMinute,
});

const seenLimiter = createFixedWindowLimiter({
  windowMs: env.seenThrottleMs,
  max: 1,
});

const pruneInterval = setInterval(() => seenLimiter.prune(), 60_000);
pruneInterval.unref();

export function setupMessageHandlers(io: Server, socket: Socket) {
  const userId = (socket as Socket & { userId: string }).userId;

  socket.on(
    'message:send',
    async (data: { conversationId: string; content: string; replyToId?: string }, callback) => {
      try {
        if (!messageRateLimiter.allow(userId)) {
          callback?.({ error: 'Rate limit exceeded. Please slow down.' });
          return;
        }

        const parsed = sendMessageSchema.safeParse(data);
        if (!parsed.success) {
          callback?.({ error: 'Invalid message payload', details: parsed.error.flatten() });
          return;
        }
        const { conversationId, content, replyToId } = parsed.data;

        const membership = await db
          .select()
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, conversationId),
              eq(conversationMembers.userId, userId),
            ),
          )
          .limit(1);

        if (membership.length === 0) {
          callback?.({ error: 'Not a member of this conversation' });
          return;
        }

        if (replyToId) {
          const [replyMessage] = await db
            .select({ id: messages.id })
            .from(messages)
            .where(and(eq(messages.id, replyToId), eq(messages.conversationId, conversationId)))
            .limit(1);

          if (!replyMessage) {
            callback?.({ error: 'Replied message not found in this conversation' });
            return;
          }
        }

        const [message] = await db
          .insert(messages)
          .values({
            conversationId,
            senderId: userId,
            content,
            type: 'TEXT',
            replyToId: replyToId || null,
          })
          .returning();

        await db.insert(messageStatus).values({
          messageId: message.id,
          userId,
          status: 'SENT',
        });

        const members = await db
          .select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(eq(conversationMembers.conversationId, conversationId));

        const recipientRows = members
          .filter((member) => member.userId !== userId)
          .map((member) => ({
            messageId: message.id,
            userId: member.userId,
            status: onlineUsers.get(member.userId)?.size ? 'DELIVERED' : 'SENT',
          }));

        if (recipientRows.length > 0) {
          await db.insert(messageStatus).values(recipientRows);
        }

        for (const row of recipientRows) {
          if (row.status === 'DELIVERED') {
            io.to(`user:${userId}`).emit('message:status', {
              messageId: message.id,
              status: 'DELIVERED',
              userId: row.userId,
              seenAt: null,
            });
          }
        }

        io.to(`conversation:${conversationId}`).emit('message:new', message);
        callback?.({ data: message });
      } catch {
        callback?.({ error: 'Failed to send message' });
      }
    },
  );

  socket.on(
    'message:seen',
    async (
      data: { conversationId: string; lastSeenMessageId: string },
      callback?: (response: unknown) => void,
    ) => {
      try {
        const parsed = messageSeenSchema.safeParse(data);
        if (!parsed.success) {
          callback?.({ error: 'Invalid message:seen payload' });
          return;
        }
        const { conversationId, lastSeenMessageId } = parsed.data;

        if (!seenLimiter.allow(`${userId}:${conversationId}`)) {
          callback?.({ data: { updated: 0 } });
          return;
        }

        const membership = await db
          .select()
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, conversationId),
              eq(conversationMembers.userId, userId),
            ),
          )
          .limit(1);

        if (membership.length === 0) {
          callback?.({ error: 'Not a member of this conversation' });
          return;
        }

        const [lastSeenMessage] = await db
          .select({ id: messages.id, createdAt: messages.createdAt })
          .from(messages)
          .where(
            and(eq(messages.id, lastSeenMessageId), eq(messages.conversationId, conversationId)),
          )
          .limit(1);

        if (!lastSeenMessage) {
          callback?.({ error: 'Message not found in this conversation' });
          return;
        }

        const now = new Date();
        const targetIds = (
          await db
            .select({ id: messages.id })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, conversationId),
                sql`${messages.createdAt} <= (SELECT created_at FROM messages WHERE id = ${lastSeenMessageId})`,
                ne(messages.senderId, userId),
              ),
            )
        ).map((row) => row.id);

        if (targetIds.length === 0) {
          callback?.({ data: { updated: 0, seenAt: null } });
          return;
        }

        const existingRows = await db
          .select({ messageId: messageStatus.messageId })
          .from(messageStatus)
          .where(
            and(eq(messageStatus.userId, userId), inArray(messageStatus.messageId, targetIds)),
          );
        const existingIds = new Set(existingRows.map((row) => row.messageId));

        const updated = await db
          .update(messageStatus)
          .set({
            status: 'SEEN',
            seenAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(messageStatus.userId, userId),
              ne(messageStatus.status, 'SEEN'),
              inArray(messageStatus.messageId, [...existingIds]),
            ),
          )
          .returning({ messageId: messageStatus.messageId });

        const newIds = targetIds.filter((id) => !existingIds.has(id));
        if (newIds.length > 0) {
          await db.insert(messageStatus).values(
            newIds.map((id) => ({
              messageId: id,
              userId,
              status: 'SEEN' as const,
              seenAt: now,
              updatedAt: now,
            })),
          );
        }

        const changedIds = [...new Set([...updated.map((row) => row.messageId), ...newIds])];
        const seenAt = now.toISOString();

        if (changedIds.length > 0) {
          const senders = await db
            .select({ id: messages.id, senderId: messages.senderId })
            .from(messages)
            .where(inArray(messages.id, changedIds));

          for (const { id, senderId } of senders) {
            io.to(`user:${senderId}`).emit('message:status', {
              messageId: id,
              status: 'SEEN',
              userId,
              seenAt,
            });
          }
        }

        callback?.({ data: { updated: changedIds.length, seenAt } });
      } catch {
        callback?.({ error: 'Failed to update message status' });
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
          .where(
            and(
              eq(messages.id, data.messageId),
              eq(messages.senderId, userId),
              eq(messages.conversationId, data.conversationId),
            ),
          )
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

  const setMessagePinned = async (
    messageId: string,
    isPinned: boolean,
    callback?: (response: unknown) => void,
  ) => {
    try {
      const [message] = await db
        .select({ id: messages.id, conversationId: messages.conversationId })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message) {
        callback?.({ error: 'Message not found' });
        return;
      }

      const [membership] = await db
        .select({ id: conversationMembers.id })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, message.conversationId),
            eq(conversationMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership) {
        callback?.({ error: 'Not a member of this conversation' });
        return;
      }

      await updateMessagePinned(messageId, isPinned);

      io.to(`conversation:${message.conversationId}`).emit('message:pin:updated', {
        messageId,
        isPinned,
      });

      callback?.({ data: { messageId, isPinned } });
    } catch {
      callback?.({ error: 'Failed to update message pin' });
    }
  };

  socket.on('message:pin', (data: { messageId: string }, callback) => {
    const parsed = pinMessageSchema.safeParse(data);
    if (!parsed.success) {
      callback?.({ error: 'Invalid message:pin payload' });
      return;
    }
    void setMessagePinned(parsed.data.messageId, true, callback);
  });

  socket.on('message:unpin', (data: { messageId: string }, callback) => {
    const parsed = pinMessageSchema.safeParse(data);
    if (!parsed.success) {
      callback?.({ error: 'Invalid message:unpin payload' });
      return;
    }
    void setMessagePinned(parsed.data.messageId, false, callback);
  });
}

export async function catchUpMessageDelivery(io: Server, userId: string) {
  try {
    const pending = await db
      .select({
        messageId: messageStatus.messageId,
        senderId: messages.senderId,
      })
      .from(messageStatus)
      .innerJoin(messages, eq(messages.id, messageStatus.messageId))
      .where(
        and(
          eq(messageStatus.userId, userId),
          eq(messageStatus.status, 'SENT'),
          ne(messages.senderId, userId),
        ),
      );

    if (pending.length === 0) return;

    const now = new Date();
    await db
      .update(messageStatus)
      .set({ status: 'DELIVERED', updatedAt: now })
      .where(
        and(
          eq(messageStatus.userId, userId),
          eq(messageStatus.status, 'SENT'),
          inArray(
            messageStatus.messageId,
            pending.map((row) => row.messageId),
          ),
        ),
      );

    for (const { messageId, senderId } of pending) {
      io.to(`user:${senderId}`).emit('message:status', {
        messageId,
        status: 'DELIVERED',
        userId,
        seenAt: null,
      });
    }
  } catch (err) {
    console.error(`Failed to deliver pending SENT messages for user ${userId}:`, err);
  }
}

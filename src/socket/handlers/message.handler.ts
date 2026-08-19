import { Server, Socket } from 'socket.io';
import db from '../../db/index';
import { messages } from '../../db/schema/messages';
import { messageStatus } from '../../db/schema/messageStatus';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { conversations } from '../../db/schema/conversations';
import { eq, and, ne, sql, inArray } from 'drizzle-orm';
import {
  sendMessageSchema,
  messageSeenSchema,
  pinMessageSchema,
  reactionSchema,
} from '../../modules/conversations/conversations.validator';
import {
  updateMessagePinned,
  findReaction,
  addReaction,
  removeReaction,
  findReactionsByMessage,
  addStar,
  removeStar,
} from '../../modules/conversations/conversations.repository';
import { findUserById, findUserIdsByUsernames } from '../../modules/auth/auth.repository';
import {
  isBlockedByAnyMember,
  hasBlockedAnyMember,
} from '../../modules/users/blockedUsers.repository';
import { createAndEmitMany } from '../../modules/notifications/notifications.service';
import { toSender } from '../../utils/sender';
import { sendIncomingPush } from '../../modules/devices/devices.service';
import { env } from '../../config/env';
import { createMessageRateLimiter, createFixedWindowLimiter } from '../rateLimit';
import { onlineUsers } from '../onlineUsers';

function extractMentions(content: string): string[] {
  const tokens = content.match(/(^|[^\w])@([A-Za-z0-9_]{3,30})(?=[\s,.;:!?"')]|$)/g);
  if (!tokens) return [];
  const seen = new Set<string>();
  for (const token of tokens) {
    seen.add(token.replace(/^[^\w]?@/, ''));
  }
  return [...seen];
}

const messageRateLimiter = createMessageRateLimiter({
  perSecond: env.messageRatePerSecond,
  perMinute: env.messageRatePerMinute,
});

export { messageRateLimiter };

const seenLimiter = createFixedWindowLimiter({
  windowMs: env.seenThrottleMs,
  max: 1,
});

const pinLimiter = createFixedWindowLimiter({
  windowMs: env.pinThrottleMs,
  max: 1,
});

const reactionLimiter = createFixedWindowLimiter({
  windowMs: env.reactionThrottleMs,
  max: 1,
});

const starLimiter = createFixedWindowLimiter({
  windowMs: env.starThrottleMs,
  max: 1,
});

const pruneInterval = setInterval(() => {
  seenLimiter.prune();
  pinLimiter.prune();
  reactionLimiter.prune();
  starLimiter.prune();
}, 60_000);
pruneInterval.unref();

async function groupReactions(messageId: string) {
  const rows = await findReactionsByMessage(messageId);
  const byEmoji = new Map<string, string[]>();
  for (const row of rows) {
    const userIds = byEmoji.get(row.emoji) ?? [];
    userIds.push(row.userId);
    byEmoji.set(row.emoji, userIds);
  }
  return [...byEmoji.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
}

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

        const [membership] = await db
          .select({
            conversationType: conversations.type,
            conversationName: conversations.name,
          })
          .from(conversationMembers)
          .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
          .where(
            and(
              eq(conversationMembers.conversationId, conversationId),
              eq(conversationMembers.userId, userId),
            ),
          )
          .limit(1);

        if (!membership) {
          callback?.({ error: 'Not a member of this conversation' });
          return;
        }

        if (await isBlockedByAnyMember(conversationId, userId)) {
          callback?.({ error: 'You are blocked by a member of this conversation' });
          return;
        }

        if (
          membership.conversationType === 'PRIVATE' &&
          (await hasBlockedAnyMember(conversationId, userId))
        ) {
          callback?.({ error: 'You have blocked a member of this conversation' });
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

        const { message, members, recipientRows } = await db.transaction(async (tx) => {
          const [message] = await tx
            .insert(messages)
            .values({
              conversationId,
              senderId: userId,
              content,
              type: 'TEXT',
              replyToId: replyToId || null,
            })
            .returning();

          await tx.insert(messageStatus).values({
            messageId: message.id,
            userId,
            status: 'SENT',
          });

          const members = await tx
            .select({
              userId: conversationMembers.userId,
              mutedUntil: conversationMembers.mutedUntil,
            })
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
            await tx.insert(messageStatus).values(recipientRows);
          }

          return { message, members, recipientRows };
        });

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

        const senderUser = await findUserById(userId);
        const messagePayload = { ...message, sender: toSender(senderUser) };

        io.to(`conversation:${conversationId}`).emit('message:new', messagePayload);

        if (membership.conversationType === 'GROUP') {
          try {
            const usernames = extractMentions(content);
            if (usernames.length > 0) {
              const mentioned = await findUserIdsByUsernames(usernames);
              if (mentioned.length > 0) {
                const recipientIdSet = new Set(recipientRows.map((r) => r.userId));
                const targets = mentioned.filter((m) => recipientIdSet.has(m.id));
                if (targets.length > 0) {
                  const sender = await findUserById(userId);
                  await createAndEmitMany(
                    targets.map((t) => ({
                      userId: t.id,
                      type: 'mention',
                      actorId: userId,
                      conversationId,
                      messageId: message.id,
                      title: 'Mention',
                      body: `@${sender?.username || 'Someone'} menyebut Anda`,
                    })),
                  );
                }
              }
            }
          } catch {
            // Notification failure must not fail the message send.
          }
        }

        callback?.({ data: messagePayload });

        const offlineTargets = recipientRows
          .filter((row) => row.status === 'SENT')
          .map((row) => ({
            userId: row.userId,
            mutedUntil: members.find((m) => m.userId === row.userId)?.mutedUntil ?? null,
          }));

        if (offlineTargets.length > 0) {
          void sendIncomingPush({
            conversationId,
            conversationType: membership.conversationType,
            conversationName: membership.conversationName,
            messageId: message.id,
            senderId: userId,
            senderName: senderUser?.fullName || senderUser?.username || userId,
            content,
            targets: offlineTargets,
          });
        }
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
          await db
            .insert(messageStatus)
            .values(
              newIds.map((id) => ({
                messageId: id,
                userId,
                status: 'SEEN' as const,
                seenAt: now,
                updatedAt: now,
              })),
            )
            .onConflictDoUpdate({
              target: [messageStatus.messageId, messageStatus.userId],
              set: { status: 'SEEN', seenAt: now, updatedAt: now },
            });
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
        if (message.type === 'SYSTEM') {
          callback?.({ error: 'Cannot delete a system message' });
          return;
        }

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
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          isDeleted: messages.isDeleted,
          type: messages.type,
        })
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

      if (message.isDeleted && isPinned) {
        callback?.({ error: 'Cannot pin a deleted message' });
        return;
      }

      if (message.type === 'SYSTEM' && isPinned) {
        callback?.({ error: 'Cannot pin a system message' });
        return;
      }

      await updateMessagePinned(messageId, isPinned);

      io.to(`conversation:${message.conversationId}`).emit('message:pin:updated', {
        conversationId: message.conversationId,
        messageId,
        isPinned,
      });

      callback?.({ data: { messageId, isPinned } });
    } catch {
      callback?.({ error: 'Failed to update message pin' });
    }
  };

  socket.on('message:pin', (data: { messageId: string }, callback) => {
    if (!pinLimiter.allow(userId)) {
      callback?.({ error: 'Rate limit exceeded. Please slow down.' });
      return;
    }

    const parsed = pinMessageSchema.safeParse(data);
    if (!parsed.success) {
      callback?.({ error: 'Invalid message:pin payload' });
      return;
    }
    void setMessagePinned(parsed.data.messageId, true, callback);
  });

  socket.on('message:unpin', (data: { messageId: string }, callback) => {
    if (!pinLimiter.allow(userId)) {
      callback?.({ error: 'Rate limit exceeded. Please slow down.' });
      return;
    }

    const parsed = pinMessageSchema.safeParse(data);
    if (!parsed.success) {
      callback?.({ error: 'Invalid message:unpin payload' });
      return;
    }
    void setMessagePinned(parsed.data.messageId, false, callback);
  });

  const handleStar = async (
    data: { messageId: string },
    star: boolean,
    callback?: (response: unknown) => void,
  ) => {
    try {
      if (!starLimiter.allow(userId)) {
        callback?.({ error: 'Rate limit exceeded. Please slow down.' });
        return;
      }

      const parsed = pinMessageSchema.safeParse(data);
      if (!parsed.success) {
        callback?.({
          error: star ? 'Invalid message:star payload' : 'Invalid message:unstar payload',
        });
        return;
      }
      const { messageId } = parsed.data;

      const [message] = await db
        .select({
          conversationId: messages.conversationId,
          type: messages.type,
          isDeleted: messages.isDeleted,
        })
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

      if (star && message.isDeleted) {
        callback?.({ error: 'Cannot star a deleted message' });
        return;
      }
      if (star && message.type === 'SYSTEM') {
        callback?.({ error: 'Cannot star a system message' });
        return;
      }

      if (star) {
        await addStar(messageId, userId);
      } else {
        await removeStar(messageId, userId);
      }

      const starredAt = star ? new Date().toISOString() : null;
      io.to(`user:${userId}`).emit('message:star:updated', {
        messageId,
        isStarred: star,
        starredAt,
      });

      callback?.({ data: { messageId, isStarred: star, starredAt } });
    } catch {
      callback?.({ error: 'Failed to update message star' });
    }
  };

  socket.on('message:star', (data: { messageId: string }, callback) => {
    void handleStar(data, true, callback);
  });

  socket.on('message:unstar', (data: { messageId: string }, callback) => {
    void handleStar(data, false, callback);
  });

  const emitReactions = (conversationId: string, messageId: string) =>
    groupReactions(messageId).then((reactions) => {
      io.to(`conversation:${conversationId}`).emit('message:reaction:updated', {
        messageId,
        reactions,
      });
      return reactions;
    });

  socket.on(
    'message:reaction:add',
    async (data: { messageId: string; emoji: string }, callback?: (response: unknown) => void) => {
      try {
        if (!reactionLimiter.allow(`${userId}:${data.messageId}`)) {
          callback?.({ error: 'Rate limit exceeded. Please slow down.' });
          return;
        }

        const parsed = reactionSchema.safeParse(data);
        if (!parsed.success) {
          callback?.({ error: 'Invalid message:reaction:add payload' });
          return;
        }
        const { messageId, emoji } = parsed.data;

        const [message] = await db
          .select({ conversationId: messages.conversationId })
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

        if (await findReaction(messageId, userId, emoji)) {
          callback?.({ error: 'Reaction already exists' });
          return;
        }

        await addReaction(messageId, userId, emoji);
        const reactions = await emitReactions(message.conversationId, messageId);
        callback?.({ data: { reactions } });
      } catch {
        callback?.({ error: 'Failed to add reaction' });
      }
    },
  );

  socket.on(
    'message:reaction:remove',
    async (data: { messageId: string; emoji: string }, callback?: (response: unknown) => void) => {
      try {
        const parsed = reactionSchema.safeParse(data);
        if (!parsed.success) {
          callback?.({ error: 'Invalid message:reaction:remove payload' });
          return;
        }
        const { messageId, emoji } = parsed.data;

        const [message] = await db
          .select({ conversationId: messages.conversationId })
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

        await removeReaction(messageId, userId, emoji);
        const reactions = await emitReactions(message.conversationId, messageId);
        callback?.({ data: { reactions } });
      } catch {
        callback?.({ error: 'Failed to remove reaction' });
      }
    },
  );
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

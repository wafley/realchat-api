import * as repository from './conversations.repository';
import * as groupService from '../groups/groups.service';
import { findUserById } from '../auth/auth.repository';
import { NotFoundError, BadRequestError, ForbiddenError, AppError } from '../../utils/errors';
import { toSender } from '../../utils/sender';
import { getIO } from '../../socket/index';
import { forceLeaveConversationRoom } from '../../socket/room';
import { onlineUsers } from '../../socket/onlineUsers';
import { sendIncomingPush } from '../devices/devices.service';
import { messageRateLimiter } from '../../socket/handlers/message.handler';
import { unlinkQuietly } from '../../utils/cleanup';

export async function createConversation(userId: string, data: { participantId: string }) {
  if (!data.participantId) throw new BadRequestError('participantId is required for private chat');
  if (data.participantId === userId)
    throw new BadRequestError('Cannot start a conversation with yourself');

  const participant = await findUserById(data.participantId);
  if (!participant) throw new NotFoundError('Participant not found');
  if (!participant.isVerified)
    throw new BadRequestError('Cannot start a conversation with an unverified user');

  return repository.createPrivateConversationIfMissing(userId, data.participantId);
}

export async function sendAttachmentMessage(
  userId: string,
  conversationId: string,
  data: { caption?: string; replyToId?: string; duration?: number },
  file: Express.Multer.File,
) {
  try {
    if (!messageRateLimiter.allow(userId)) {
      throw new AppError('Rate limit exceeded. Please slow down.', 429);
    }

    const membership = await repository.findConversationMembership(conversationId, userId);
    if (!membership) throw new ForbiddenError('You are not a member of this conversation');

    if (data.replyToId) {
      const replyMessage = await repository.findMessageById(data.replyToId);
      if (!replyMessage || replyMessage.conversationId !== conversationId)
        throw new BadRequestError('Replied message not found in this conversation');
    }

    const type = file.mimetype.startsWith('image/')
      ? 'IMAGE'
      : file.mimetype.startsWith('video/')
        ? 'VIDEO'
        : 'FILE';

    const content = data.caption ?? '';
    const duration = type === 'VIDEO' ? (data.duration ?? null) : null;

    const members = await repository.findConversationMemberIds(conversationId);
    const recipientRows = members
      .filter((member) => member.userId !== userId)
      .map((member) => ({
        userId: member.userId,
        mutedUntil: member.mutedUntil,
        status: onlineUsers.get(member.userId)?.size ? ('DELIVERED' as const) : ('SENT' as const),
      }));

    const message = await repository.insertAttachmentMessageAtomically(
      conversationId,
      userId,
      {
        type,
        content,
        replyToId: data.replyToId || null,
        fileUrl: `/uploads/${file.filename}`,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        duration,
      },
      recipientRows.map(({ userId: recipientId, status }) => ({ userId: recipientId, status })),
    );

    for (const row of recipientRows) {
      if (row.status === 'DELIVERED') {
        getIO().to(`user:${userId}`).emit('message:status', {
          messageId: message.id,
          status: 'DELIVERED',
          userId: row.userId,
          seenAt: null,
        });
      }
    }

    const senderUser = await findUserById(userId);
    const messagePayload = { ...message, sender: toSender(senderUser) };

    getIO().to(`conversation:${conversationId}`).emit('message:new', messagePayload);

    const offlineTargets = recipientRows
      .filter((row) => row.status === 'SENT')
      .map((row) => ({ userId: row.userId, mutedUntil: row.mutedUntil ?? null }));

    if (offlineTargets.length > 0) {
      void sendIncomingPush({
        conversationId,
        conversationType: membership.conversationType,
        conversationName: membership.conversationName,
        messageId: message.id,
        senderId: userId,
        senderName: senderUser?.fullName || senderUser?.username || userId,
        content: content || file.originalname,
        targets: offlineTargets,
      });
    }

    return messagePayload;
  } catch (error) {
    await unlinkQuietly(file.path);
    throw error;
  }
}

function encodeCompositeCursor(sortKey: Date, conversationId: string): string {
  return Buffer.from(`${sortKey.toISOString()}|${conversationId}`).toString('base64url');
}

function decodeCompositeCursor(cursor: string): { sortKey: string; id: string } {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const separator = decoded.indexOf('|');
  if (separator === -1) throw new BadRequestError('Invalid cursor format');

  const sortKey = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(Date.parse(sortKey))) throw new BadRequestError('Invalid cursor sortKey');

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) throw new BadRequestError('Invalid cursor id');

  return { sortKey, id };
}

export async function getConversations(
  userId: string,
  options: { search?: string; cursor?: string; limit?: number },
) {
  const limit = options.limit ?? 20;
  const cursor = options.cursor ? decodeCompositeCursor(options.cursor) : undefined;
  const rows = await repository.findConversationList(userId, { ...options, cursor, limit });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const conversations = page.map((row) => {
    const isPrivate = row.type === 'PRIVATE';

    const displayName = isPrivate
      ? row.customName || row.peerFullName || row.peerUsername || 'Unknown'
      : row.name || 'Group';

    const avatar = isPrivate ? (row.peerAvatarUrl ?? null) : row.avatarUrl;

    const clearedAt = row.clearedAt ? new Date(row.clearedAt) : null;
    const lastMessage =
      row.lastMessageId &&
      (!clearedAt || !row.lastMessageCreatedAt || row.lastMessageCreatedAt > clearedAt)
        ? {
            id: row.lastMessageId,
            content: row.lastMessageContent,
            type: row.lastMessageType,
            senderId: row.lastMessageSenderId,
            sender: {
              username: row.senderUsername,
              fullName: row.senderFullName,
              avatarUrl: row.senderAvatarUrl,
            },
            createdAt: row.lastMessageCreatedAt,
            isDeleted: row.lastMessageIsDeleted,
            fileUrl: row.lastMessageFileUrl ?? null,
            fileName: row.lastMessageFileName ?? null,
            fileSize: row.lastMessageFileSize ?? null,
            mimeType: row.lastMessageMimeType ?? null,
          }
        : null;

    return {
      id: row.id,
      type: row.type,
      name: row.name,
      avatarUrl: row.avatarUrl,
      description: row.description,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      displayName,
      avatar,
      isOnline: isPrivate ? (row.peerIsOnline ?? false) : null,
      lastSeenAt: isPrivate ? (row.peerLastSeenAt ?? null) : null,
      memberCount: isPrivate ? null : (row.memberCount ?? 0),
      myRole: row.myRole,
      mutedUntil: row.mutedUntil,
      clearedAt: row.clearedAt,
      unreadCount: row.unreadCount ?? 0,
      lastMessage,
    };
  });

  const lastItem = page[page.length - 1];
  const nextCursor = hasMore
    ? encodeCompositeCursor(lastItem.lastMessageCreatedAt ?? lastItem.createdAt, lastItem.id)
    : null;

  return { conversations, nextCursor };
}

export async function getConversationDetail(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const members = await repository.findMembersByConversationId(conversationId);
  const me = members.find((m) => m.userId === userId);

  return {
    ...conversation,
    mutedUntil: me?.mutedUntil ?? null,
    clearedAt: me?.clearedAt ?? null,
    members: members.map(
      ({ username, fullName, avatarUrl, isOnline, lastSeenAt, id, userId, role, joinedAt }) => ({
        id,
        userId,
        role,
        joinedAt,
        user: {
          id: userId,
          username,
          fullName,
          avatarUrl,
          isOnline,
          lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
        },
      }),
    ),
  };
}

export async function leaveConversation(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  if (conversation.type === 'GROUP') {
    return groupService.leaveGroup(userId, conversationId);
  }

  await repository.removeMember(conversationId, userId);
  await forceLeaveConversationRoom(userId, conversationId);
}

export async function getMessages(
  userId: string,
  conversationId: string,
  cursor?: string,
  limit = 50,
) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const membership = await repository.findMembershipByUser(conversationId, userId);
  const rawMessages = await repository.findMessagesByConversationId(
    conversationId,
    cursor,
    limit,
    membership?.clearedAt,
    userId,
  );
  const hasMore = rawMessages.length > limit;
  const messagesList = hasMore ? rawMessages.slice(0, limit) : rawMessages;

  const messages = messagesList.map(
    ({
      statusRank,
      seenAt,
      starredAt,
      senderUsername,
      senderFullName,
      senderAvatarUrl,
      ...message
    }) => ({
      ...message,
      status:
        statusRank == null || statusRank < 1 ? 'SENT' : statusRank >= 2 ? 'SEEN' : 'DELIVERED',
      seenAt: seenAt ? seenAt.toISOString() : null,
      starredAt: starredAt ? starredAt.toISOString() : null,
      sender: {
        username: senderUsername,
        fullName: senderFullName,
        avatarUrl: senderAvatarUrl,
      },
    }),
  );

  return {
    messages,
    nextCursor: hasMore ? messagesList[messagesList.length - 1].createdAt.toISOString() : null,
  };
}

export async function clearConversation(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const row = await repository.clearConversation(conversationId, userId);

  const incomingIds = await repository.findIncomingMessageIdsByConversation(conversationId, userId);
  if (incomingIds.length > 0) {
    await repository.markMessagesSeen(userId, incomingIds, new Date());
  }

  return { clearedAt: row?.clearedAt ? row.clearedAt.toISOString() : null };
}

export async function editMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  content: string,
) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.senderId !== userId) throw new ForbiddenError('You can only edit your own messages');
  if (message.conversationId !== conversationId)
    throw new ForbiddenError('Message does not belong to this conversation');
  if (message.isDeleted) throw new BadRequestError('Cannot edit a deleted message');
  if (message.type === 'SYSTEM') throw new BadRequestError('Cannot edit a system message');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const updated = await repository.updateMessageContent(messageId, content);

  getIO().to(`conversation:${message.conversationId}`).emit('message:edited', updated);

  return updated;
}

export async function deleteMessage(userId: string, conversationId: string, messageId: string) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.senderId !== userId)
    throw new ForbiddenError('You can only delete your own messages');
  if (message.conversationId !== conversationId)
    throw new ForbiddenError('Message does not belong to this conversation');
  if (message.type === 'SYSTEM') throw new BadRequestError('Cannot delete a system message');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  await repository.softDeleteMessage(messageId);

  getIO()
    .to(`conversation:${conversationId}`)
    .emit('message:deleted', { conversationId, messageId });
}

export async function setMessagePinned(
  userId: string,
  conversationId: string,
  messageId: string,
  isPinned: boolean,
) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.conversationId !== conversationId)
    throw new ForbiddenError('Message does not belong to this conversation');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  if (isPinned && message.isDeleted) throw new BadRequestError('Cannot pin a deleted message');
  if (isPinned && message.type === 'SYSTEM')
    throw new BadRequestError('Cannot pin a system message');

  await repository.updateMessagePinned(messageId, isPinned);

  getIO()
    .to(`conversation:${conversationId}`)
    .emit('message:pin:updated', { conversationId, messageId, isPinned });

  return { isPinned };
}

export async function markConversationAsRead(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const targetIds = await repository.findIncomingMessageIdsByConversation(conversationId, userId);
  if (targetIds.length === 0) return { updated: 0, seenAt: null };

  const now = new Date();
  const changedIds = await repository.markMessagesSeen(userId, targetIds, now);

  if (changedIds.length > 0) {
    const senders = await repository.findMessageSenders(changedIds);
    for (const { id, senderId } of senders) {
      getIO().to(`user:${senderId}`).emit('message:status', {
        messageId: id,
        status: 'SEEN',
        userId,
        seenAt: now.toISOString(),
      });
    }
  }

  return { updated: changedIds.length, seenAt: now.toISOString() };
}

export async function forwardMessage(
  userId: string,
  sourceConversationId: string,
  messageId: string,
  targetConversationId: string,
) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.conversationId !== sourceConversationId)
    throw new ForbiddenError('Message does not belong to this conversation');
  if (message.isDeleted) throw new BadRequestError('Cannot forward a deleted message');
  if (message.type === 'SYSTEM') throw new BadRequestError('Cannot forward a system message');

  const [sourceMember, targetMember] = await Promise.all([
    repository.isMember(sourceConversationId, userId),
    repository.isMember(targetConversationId, userId),
  ]);
  if (!sourceMember) throw new ForbiddenError('You are not a member of this conversation');
  if (!targetMember) throw new ForbiddenError('You are not a member of the target conversation');

  const memberRows = await repository.findConversationMemberIds(targetConversationId);
  const recipientRows = memberRows
    .filter((member) => member.userId !== userId)
    .map((member) => ({
      userId: member.userId,
      status: onlineUsers.get(member.userId)?.size ? ('DELIVERED' as const) : ('SENT' as const),
    }));

  const created = await repository.forwardMessageAtomically(
    targetConversationId,
    userId,
    message.content,
    message.type,
    {
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      mimeType: message.mimeType,
      duration: message.duration,
    },
    recipientRows,
  );

  for (const row of recipientRows) {
    if (row.status === 'DELIVERED') {
      getIO().to(`user:${userId}`).emit('message:status', {
        messageId: created.id,
        status: 'DELIVERED',
        userId: row.userId,
        seenAt: null,
      });
    }
  }

  const senderUser = await findUserById(userId);
  const createdPayload = { ...created, sender: toSender(senderUser) };

  getIO().to(`conversation:${targetConversationId}`).emit('message:new', createdPayload);

  const offlineTargets = recipientRows
    .filter((row) => row.status === 'SENT')
    .map((row) => ({
      userId: row.userId,
      mutedUntil: memberRows.find((m) => m.userId === row.userId)?.mutedUntil ?? null,
    }));

  if (message.type !== 'SYSTEM' && offlineTargets.length > 0) {
    void (async () => {
      const targetConversation = await repository.findConversationById(targetConversationId);
      await sendIncomingPush({
        conversationId: targetConversationId,
        conversationType: targetConversation?.type ?? 'PRIVATE',
        conversationName: targetConversation?.name ?? null,
        messageId: created.id,
        senderId: userId,
        senderName: senderUser?.fullName || senderUser?.username || userId,
        content: message.content,
        targets: offlineTargets,
      });
    })().catch(() => {
      // Push notification failure must not fail the forward response.
    });
  }

  return createdPayload;
}

export async function getPinnedMessages(userId: string, conversationId: string, limit = 50) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const rows = await repository.findPinnedMessagesByConversation(conversationId, limit);

  return rows.map(({ senderUsername, senderFullName, senderAvatarUrl, ...message }) => ({
    ...message,
    sender: {
      username: senderUsername,
      fullName: senderFullName,
      avatarUrl: senderAvatarUrl,
    },
  }));
}

export async function setMessageStar(
  userId: string,
  conversationId: string,
  messageId: string,
  star: boolean,
) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.conversationId !== conversationId)
    throw new ForbiddenError('Message does not belong to this conversation');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  if (star) {
    if (message.isDeleted) throw new BadRequestError('Cannot star a deleted message');
    if (message.type === 'SYSTEM') throw new BadRequestError('Cannot star a system message');
    await repository.addStar(messageId, userId);
  } else {
    await repository.removeStar(messageId, userId);
  }

  const row = await repository.findStar(messageId, userId);
  const starredAt = star ? (row?.createdAt.toISOString() ?? new Date().toISOString()) : null;

  getIO().to(`user:${userId}`).emit('message:star:updated', {
    messageId,
    isStarred: star,
    starredAt,
  });

  return { starredAt };
}

export async function getStarredMessages(userId: string, cursor?: string, limit = 50) {
  const rows = await repository.findStarredMessages(userId, cursor, limit);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const messages = page.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    type: row.type,
    content: row.content,
    replyToId: row.replyToId,
    isPinned: row.isPinned,
    pinnedAt: row.pinnedAt,
    isEdited: row.isEdited,
    isDeleted: row.isDeleted,
    editedAt: row.editedAt,
    createdAt: row.createdAt,
    isStarred: true,
    starredAt: row.starredAt.toISOString(),
    sender: {
      username: row.senderUsername,
      fullName: row.senderFullName,
      avatarUrl: row.senderAvatarUrl,
    },
    conversation: {
      id: row.conversationId,
      type: row.conversationType,
      name: row.conversationName,
      avatarUrl: row.conversationAvatarUrl,
    },
  }));

  return {
    messages,
    nextCursor: hasMore ? page[page.length - 1].starredAt.toISOString() : null,
  };
}

const MUTE_FOREVER_YEARS = 10;

function muteForeverDate(): Date {
  return new Date(Date.now() + MUTE_FOREVER_YEARS * 365 * 24 * 60 * 60 * 1000);
}

export async function setConversationMute(userId: string, conversationId: string, until?: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  let mutedUntil: Date;
  if (until) {
    const parsed = new Date(until);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestError('Invalid until date');
    if (parsed.getTime() <= Date.now()) throw new BadRequestError('until must be in the future');
    mutedUntil = parsed;
  } else {
    mutedUntil = muteForeverDate();
  }

  const row = await repository.setMutedUntil(conversationId, userId, mutedUntil);
  return { mutedUntil: (row?.mutedUntil ?? mutedUntil).toISOString() };
}

export async function unmuteConversation(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  await repository.setMutedUntil(conversationId, userId, null);
  return { mutedUntil: null };
}

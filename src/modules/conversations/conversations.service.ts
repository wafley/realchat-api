import * as repository from './conversations.repository';
import { findUserById } from '../auth/auth.repository';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';
import { getIO } from '../../socket/index';

export async function createConversation(
  userId: string,
  data: {
    type: 'PRIVATE' | 'GROUP';
    participantId?: string;
    name?: string;
    participantIds?: string[];
  },
) {
  if (data.type === 'PRIVATE') {
    if (!data.participantId)
      throw new BadRequestError('participantId is required for private chat');

    const participant = await findUserById(data.participantId);
    if (!participant) throw new NotFoundError('Participant not found');
    if (!participant.isVerified)
      throw new BadRequestError('Cannot start a conversation with an unverified user');

    const existing = await repository.findPrivateConversation(userId, data.participantId);
    if (existing) return existing;

    const conversation = await repository.createConversation({
      type: 'PRIVATE',
      createdBy: userId,
    });

    await repository.addMembers(conversation.id, [
      { userId, role: 'MEMBER' },
      { userId: data.participantId, role: 'MEMBER' },
    ]);

    return conversation;
  }

  const allIds = [userId, ...(data.participantIds || [])];
  if (allIds.length < 3) throw new BadRequestError('Group must have at least 3 members');

  for (const id of allIds) {
    const user = await findUserById(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    if (!user.isVerified) throw new BadRequestError('All group members must be verified');
  }

  const conversation = await repository.createConversation({
    type: 'GROUP',
    name: data.name,
    createdBy: userId,
  });

  await repository.addMembers(
    conversation.id,
    allIds.map((id) => ({
      userId: id,
      role: id === userId ? 'ADMIN' : 'MEMBER',
    })),
  );

  return conversation;
}

export async function getConversations(
  userId: string,
  options: { search?: string; cursor?: string; limit?: number },
) {
  const limit = options.limit ?? 20;
  const rows = await repository.findConversationList(userId, { ...options, limit });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const conversations = page.map((row) => {
    const isPrivate = row.type === 'PRIVATE';

    const displayName = isPrivate
      ? row.customName || row.peerFullName || row.peerUsername || 'Unknown'
      : row.name || 'Group';

    const avatar = isPrivate ? (row.peerAvatarUrl ?? null) : row.avatarUrl;

    const lastMessage = row.lastMessageId
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
      lastMessage,
    };
  });

  const lastItem = page[page.length - 1];
  const nextCursor = hasMore
    ? (lastItem.lastMessageCreatedAt ?? lastItem.createdAt).toISOString()
    : null;

  return { conversations, nextCursor };
}

export async function getConversationDetail(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const members = await repository.findMembersByConversationId(conversationId);

  return { ...conversation, members };
}

export async function leaveConversation(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  await repository.removeMember(conversationId, userId);
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

  const rawMessages = await repository.findMessagesByConversationId(conversationId, cursor, limit);
  const hasMore = rawMessages.length > limit;
  const messagesList = hasMore ? rawMessages.slice(0, limit) : rawMessages;

  const messages = messagesList.map(({ statusRank, seenAt, ...message }) => ({
    ...message,
    status: statusRank == null || statusRank < 1 ? 'SENT' : statusRank >= 2 ? 'SEEN' : 'DELIVERED',
    seenAt: seenAt ? seenAt.toISOString() : null,
  }));

  return {
    messages,
    nextCursor: hasMore ? messagesList[messagesList.length - 1].createdAt.toISOString() : null,
  };
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

  await repository.softDeleteMessage(messageId);
}

export async function getPinnedMessages(userId: string, conversationId: string) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const rows = await repository.findPinnedMessagesByConversation(conversationId);

  return rows.map(({ senderUsername, senderFullName, senderAvatarUrl, ...message }) => ({
    ...message,
    sender: {
      username: senderUsername,
      fullName: senderFullName,
      avatarUrl: senderAvatarUrl,
    },
  }));
}

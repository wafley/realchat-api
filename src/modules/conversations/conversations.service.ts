import * as repository from './conversations.repository';
import { findUserById } from '../auth/auth.repository';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';

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

export async function getConversations(userId: string) {
  const list = await repository.findConversationsByUserId(userId);

  const result = [];
  for (const conv of list) {
    const lastMessage = await repository.getLastMessage(conv.id);
    result.push({ ...conv, lastMessage });
  }

  return result;
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

export async function sendMessage(
  userId: string,
  conversationId: string,
  data: { content: string; replyToId?: string },
) {
  const conversation = await repository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const member = await repository.isMember(conversationId, userId);
  if (!member) throw new ForbiddenError('You are not a member of this conversation');

  const message = await repository.createMessage({
    conversationId,
    senderId: userId,
    content: data.content,
    replyToId: data.replyToId,
  });

  await repository.createMessageStatus(message.id, userId, 'SENT');

  return message;
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

  return {
    messages: messagesList,
    nextCursor: hasMore ? messagesList[messagesList.length - 1].createdAt.toISOString() : null,
  };
}

export async function editMessage(userId: string, messageId: string, content: string) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.senderId !== userId) throw new ForbiddenError('You can only edit your own messages');

  const updated = await repository.updateMessageContent(messageId, content);
  return updated;
}

export async function deleteMessage(userId: string, messageId: string) {
  const message = await repository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.senderId !== userId)
    throw new ForbiddenError('You can only delete your own messages');

  await repository.softDeleteMessage(messageId);
}

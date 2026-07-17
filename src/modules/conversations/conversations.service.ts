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

  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

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

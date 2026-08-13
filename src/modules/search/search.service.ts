import * as repository from './search.repository';
import { ForbiddenError } from '../../utils/errors';

export async function searchUsers(currentUserId: string, q: string, limit = 50) {
  return repository.searchUsers(currentUserId, q, limit);
}

export async function searchGroups(currentUserId: string, q: string, cursor?: string, limit = 50) {
  const rows = await repository.searchGroups(currentUserId, q, cursor, limit);
  const hasMore = rows.length > limit;
  const groups = hasMore ? rows.slice(0, limit) : rows;

  return {
    groups: groups.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? groups[groups.length - 1].createdAt : null,
  };
}

export async function searchMessages(
  userId: string,
  options: {
    q: string;
    conversationId?: string;
    before?: Date;
    after?: Date;
    cursor?: string;
    limit?: number;
  },
) {
  const { conversationId, q, before, after, cursor, limit = 50 } = options;

  if (conversationId) {
    const isMember = await repository.isConversationMember(conversationId, userId);
    if (!isMember) throw new ForbiddenError('You are not a member of this conversation');
  }

  const rows = await repository.searchMessages(userId, {
    conversationId,
    q,
    before,
    after,
    cursor,
    limit,
  });
  const hasMore = rows.length > limit;
  const messages = hasMore ? rows.slice(0, limit) : rows;

  return {
    messages: messages.map(({ senderUsername, senderFullName, ...message }) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
      sender: {
        username: senderUsername,
        fullName: senderFullName,
      },
    })),
    nextCursor: hasMore ? messages[messages.length - 1].createdAt.toISOString() : null,
  };
}

export async function searchDmMessages(userId: string, q: string, cursor?: string, limit = 50) {
  const rows = await repository.searchDmMessages(userId, q, cursor, limit);
  const hasMore = rows.length > limit;
  const messages = hasMore ? rows.slice(0, limit) : rows;

  return {
    messages: messages.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? messages[messages.length - 1].createdAt.toISOString() : null,
  };
}

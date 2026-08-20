import db from '../../db/index';
import { users } from '../../db/schema/users';
import { conversations } from '../../db/schema/conversations';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { messages } from '../../db/schema/messages';
import {
  eq,
  and,
  or,
  ne,
  lt,
  gt,
  desc,
  count,
  ilike,
  sql,
  isNull,
  notExists,
  aliasedTable,
  type SQL,
} from 'drizzle-orm';
import { blockedUsers } from '../../db/schema/blockedUsers';

const senderUser = aliasedTable(users, 'sender_user');

const messageColumns = {
  id: messages.id,
  conversationId: messages.conversationId,
  senderId: messages.senderId,
  type: messages.type,
  content: messages.content,
  isPinned: messages.isPinned,
  isEdited: messages.isEdited,
  isDeleted: messages.isDeleted,
  createdAt: messages.createdAt,
};

function escapeLike(q: string) {
  return q.replace(/[\\%_]/g, '\\$&');
}

export async function isConversationMember(conversationId: string, userId: string) {
  const [result] = await db
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return !!result;
}

export async function searchUsers(currentUserId: string, q: string, limit = 50) {
  const pattern = `%${escapeLike(q)}%`;
  const noBlockRelation = notExists(
    db
      .select({ id: blockedUsers.id })
      .from(blockedUsers)
      .where(
        or(
          and(eq(blockedUsers.blockerId, currentUserId), eq(blockedUsers.blockedId, users.id)),
          and(eq(blockedUsers.blockerId, users.id), eq(blockedUsers.blockedId, currentUserId)),
        ),
      ),
  );
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      statusText: users.statusText,
      isOnline: users.isOnline,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(
      and(
        ne(users.id, currentUserId),
        eq(users.isVerified, true),
        or(ilike(users.username, pattern), ilike(users.fullName, pattern))!,
        noBlockRelation,
      ),
    )
    .orderBy(desc(users.isOnline), users.username)
    .limit(limit);
  return rows;
}

export async function searchGroups(currentUserId: string, q: string, cursor?: string, limit = 50) {
  const pattern = `%${escapeLike(q)}%`;
  const memberCounts = db
    .select({
      conversationId: conversationMembers.conversationId,
      value: count(conversationMembers.id).as('member_count'),
    })
    .from(conversationMembers)
    .groupBy(conversationMembers.conversationId)
    .as('member_counts');

  const mine = db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, currentUserId))
    .as('mine');

  const conditions: SQL[] = [eq(conversations.type, 'GROUP'), ilike(conversations.name, pattern)];
  if (cursor) conditions.push(lt(conversations.createdAt, new Date(cursor)));

  const rows = await db
    .select({
      id: conversations.id,
      name: conversations.name,
      avatarUrl: conversations.avatarUrl,
      description: conversations.description,
      createdBy: conversations.createdBy,
      createdAt: conversations.createdAt,
      memberCount: memberCounts.value,
    })
    .from(conversations)
    .innerJoin(mine, eq(mine.conversationId, conversations.id))
    .leftJoin(memberCounts, eq(memberCounts.conversationId, conversations.id))
    .where(and(...conditions))
    .orderBy(desc(conversations.createdAt))
    .limit(limit + 1);
  return rows;
}

export async function searchMessages(
  userId: string,
  options: {
    conversationId?: string;
    q: string;
    before?: Date;
    after?: Date;
    cursor?: string;
    limit?: number;
  },
) {
  const { conversationId, q, before, after, cursor, limit = 50 } = options;
  const pattern = `%${escapeLike(q)}%`;

  const conditions: SQL[] = [eq(messages.isDeleted, false), ilike(messages.content, pattern)];
  if (conversationId) {
    conditions.push(eq(messages.conversationId, conversationId));
  } else {
    conditions.push(
      eq(conversationMembers.conversationId, messages.conversationId),
      eq(conversationMembers.userId, userId),
      isNull(conversationMembers.hiddenAt),
    );
  }
  if (before) conditions.push(lt(messages.createdAt, before));
  if (after) conditions.push(gt(messages.createdAt, after));
  if (cursor) conditions.push(lt(messages.createdAt, new Date(cursor)));

  let query = db
    .select({
      ...messageColumns,
      senderUsername: senderUser.username,
      senderFullName: senderUser.fullName,
    })
    .from(messages)
    .innerJoin(senderUser, eq(senderUser.id, messages.senderId));

  if (!conversationId) {
    query = query.innerJoin(
      conversationMembers,
      eq(conversationMembers.conversationId, messages.conversationId),
    );
  }

  return query
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);
}

export async function searchDmMessages(userId: string, q: string, cursor?: string, limit = 50) {
  const pattern = `%${escapeLike(q)}%`;
  const peer = aliasedTable(users, 'peer_user');
  const mine = aliasedTable(conversationMembers, 'mine');
  const peerMember = aliasedTable(conversationMembers, 'peer_member');

  const conditions: SQL[] = [
    eq(messages.isDeleted, false),
    ilike(messages.content, pattern),
    eq(conversations.type, 'PRIVATE'),
    eq(mine.conversationId, messages.conversationId),
    eq(mine.userId, userId),
    isNull(mine.hiddenAt),
    eq(peerMember.conversationId, messages.conversationId),
    ne(peerMember.userId, userId),
    eq(peer.id, peerMember.userId),
  ];
  if (cursor) conditions.push(lt(messages.createdAt, new Date(cursor)));

  const rows = await db
    .select({
      messageId: messages.id,
      conversationId: conversations.id,
      conversationName: sql<string>`COALESCE(${peer.fullName}, ${peer.username})`,
      senderId: messages.senderId,
      senderName: sql<string>`COALESCE(${senderUser.fullName}, ${senderUser.username})`,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(mine, eq(mine.conversationId, messages.conversationId))
    .innerJoin(peerMember, eq(peerMember.conversationId, messages.conversationId))
    .innerJoin(peer, eq(peer.id, peerMember.userId))
    .innerJoin(senderUser, eq(senderUser.id, messages.senderId))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);
  return rows;
}

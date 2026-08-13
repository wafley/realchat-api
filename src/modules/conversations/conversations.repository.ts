import db from '../../db/index';
import { conversations } from '../../db/schema/conversations';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { messages } from '../../db/schema/messages';
import { messageStatus } from '../../db/schema/messageStatus';
import { messageReactions } from '../../db/schema/messageReactions';
import { messageStars } from '../../db/schema/messageStars';
import { users } from '../../db/schema/users';
import { contacts } from '../../db/schema/contacts';
import { notifications } from '../../db/schema/notifications';
import {
  eq,
  and,
  desc,
  lt,
  gt,
  ne,
  or,
  count,
  ilike,
  sql,
  inArray,
  aliasedTable,
  type SQL,
} from 'drizzle-orm';

export const conversationColumns = {
  id: conversations.id,
  type: conversations.type,
  name: conversations.name,
  avatarUrl: conversations.avatarUrl,
  description: conversations.description,
  createdBy: conversations.createdBy,
  createdAt: conversations.createdAt,
};

export const memberColumns = {
  id: conversationMembers.id,
  userId: conversationMembers.userId,
  role: conversationMembers.role,
  joinedAt: conversationMembers.joinedAt,
  mutedUntil: conversationMembers.mutedUntil,
  clearedAt: conversationMembers.clearedAt,
};

export async function createConversation(data: {
  type: string;
  name?: string;
  createdBy: string;
  description?: string | null;
  avatarUrl?: string | null;
}) {
  const [conversation] = await db.insert(conversations).values(data).returning(conversationColumns);
  return conversation;
}

export async function addMembers(
  conversationId: string,
  userIds: { userId: string; role: string }[],
) {
  const values = userIds.map((u) => ({
    conversationId,
    userId: u.userId,
    role: u.role,
  }));
  return db.insert(conversationMembers).values(values).returning();
}

export async function findPrivateConversation(userId1: string, userId2: string) {
  const c1 = db
    .select({ id: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId1))
    .as('c1');

  const [result] = await db
    .select(conversationColumns)
    .from(conversations)
    .innerJoin(c1, eq(c1.id, conversations.id))
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, conversations.id),
        eq(conversationMembers.userId, userId2),
      ),
    )
    .where(eq(conversations.type, 'PRIVATE'))
    .limit(1);

  return result || null;
}

export async function findConversationList(
  userId: string,
  options: { search?: string; cursor?: { sortKey: string; id: string }; limit: number },
) {
  const { search, cursor, limit } = options;

  const mine = db
    .select({
      conversationId: conversationMembers.conversationId,
      role: conversationMembers.role,
      mutedUntil: conversationMembers.mutedUntil,
      clearedAt: conversationMembers.clearedAt,
    })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId))
    .as('mine');

  const userConversations = db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));

  const peer = db
    .select({
      conversationId: conversationMembers.conversationId,
      userId: conversationMembers.userId,
    })
    .from(conversationMembers)
    .where(
      and(
        ne(conversationMembers.userId, userId),
        inArray(conversationMembers.conversationId, userConversations),
      ),
    )
    .as('peer');

  const peerUser = aliasedTable(users, 'peer_user');

  const lastMessage = db
    .selectDistinctOn([messages.conversationId], {
      conversationId: messages.conversationId,
      id: messages.id,
      content: messages.content,
      type: messages.type,
      senderId: messages.senderId,
      createdAt: messages.createdAt,
      isDeleted: messages.isDeleted,
      senderUsername: users.username,
      senderFullName: users.fullName,
      senderAvatarUrl: users.avatarUrl,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .orderBy(messages.conversationId, desc(messages.createdAt))
    .as('last_message');

  const memberCounts = db
    .select({
      conversationId: conversationMembers.conversationId,
      value: count(conversationMembers.id).as('member_count'),
    })
    .from(conversationMembers)
    .where(inArray(conversationMembers.conversationId, userConversations))
    .groupBy(conversationMembers.conversationId)
    .as('member_counts');

  const unread = db
    .select({
      conversationId: messages.conversationId,
      value: count().mapWith(Number).as('unread_count'),
    })
    .from(messageStatus)
    .innerJoin(messages, eq(messages.id, messageStatus.messageId))
    .where(
      and(
        eq(messageStatus.userId, userId),
        ne(messageStatus.status, 'SEEN'),
        ne(messages.senderId, userId),
      ),
    )
    .groupBy(messages.conversationId)
    .as('unread');

  const sortKey = sql`COALESCE(${lastMessage.createdAt}, ${conversations.createdAt})`;

  const conditions: (SQL | undefined)[] = [];
  if (search) {
    const escaped = search.replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    conditions.push(
      or(
        ilike(conversations.name, pattern),
        ilike(peerUser.username, pattern),
        ilike(peerUser.fullName, pattern),
        ilike(contacts.customName, pattern),
        ilike(lastMessage.content, pattern),
      )!,
    );
  }
  if (cursor)
    conditions.push(
      sql`(${sortKey}, ${conversations.id}) < (${cursor.sortKey}::timestamptz, ${cursor.id}::uuid)`,
    );

  return db
    .select({
      id: conversations.id,
      type: conversations.type,
      name: conversations.name,
      avatarUrl: conversations.avatarUrl,
      description: conversations.description,
      createdBy: conversations.createdBy,
      createdAt: conversations.createdAt,
      myRole: mine.role,
      mutedUntil: mine.mutedUntil,
      clearedAt: mine.clearedAt,
      lastMessageId: lastMessage.id,
      lastMessageContent: lastMessage.content,
      lastMessageType: lastMessage.type,
      lastMessageSenderId: lastMessage.senderId,
      lastMessageCreatedAt: lastMessage.createdAt,
      lastMessageIsDeleted: lastMessage.isDeleted,
      senderUsername: lastMessage.senderUsername,
      senderFullName: lastMessage.senderFullName,
      senderAvatarUrl: lastMessage.senderAvatarUrl,
      peerId: peerUser.id,
      peerUsername: peerUser.username,
      peerFullName: peerUser.fullName,
      peerAvatarUrl: peerUser.avatarUrl,
      peerIsOnline: peerUser.isOnline,
      peerLastSeenAt: peerUser.lastSeenAt,
      customName: contacts.customName,
      memberCount: memberCounts.value,
      unreadCount: unread.value,
    })
    .from(conversations)
    .innerJoin(mine, eq(mine.conversationId, conversations.id))
    .leftJoin(lastMessage, eq(lastMessage.conversationId, conversations.id))
    .leftJoin(
      peer,
      and(
        eq(peer.conversationId, conversations.id),
        ne(peer.userId, userId),
        eq(conversations.type, 'PRIVATE'),
      ),
    )
    .leftJoin(peerUser, eq(peerUser.id, peer.userId))
    .leftJoin(contacts, and(eq(contacts.userId, userId), eq(contacts.contactId, peer.userId)))
    .leftJoin(memberCounts, eq(memberCounts.conversationId, conversations.id))
    .leftJoin(unread, eq(unread.conversationId, conversations.id))
    .where(and(...conditions))
    .orderBy(sql`${sortKey} DESC NULLS LAST`, desc(conversations.id))
    .limit(limit + 1);
}

export async function findConversationById(id: string) {
  const [result] = await db
    .select(conversationColumns)
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return result || null;
}

export async function findMembersByConversationId(conversationId: string) {
  return db
    .select(memberColumns)
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
}

export async function isMember(conversationId: string, userId: string) {
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

export async function findMembershipByUser(conversationId: string, userId: string) {
  const [result] = await db
    .select({ clearedAt: conversationMembers.clearedAt })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return result || null;
}

export async function removeMember(conversationId: string, userId: string) {
  await db
    .delete(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    );
}

const messageColumns = {
  id: messages.id,
  conversationId: messages.conversationId,
  senderId: messages.senderId,
  type: messages.type,
  content: messages.content,
  replyToId: messages.replyToId,
  isPinned: messages.isPinned,
  pinnedAt: messages.pinnedAt,
  isEdited: messages.isEdited,
  isDeleted: messages.isDeleted,
  editedAt: messages.editedAt,
  createdAt: messages.createdAt,
};

const pinnedMessageSenderColumns = {
  senderUsername: users.username,
  senderFullName: users.fullName,
  senderAvatarUrl: users.avatarUrl,
};

export async function findMessagesByConversationId(
  conversationId: string,
  cursor?: string,
  limit = 50,
  clearedAt?: Date | null,
  userId?: string,
) {
  const conditions = [eq(messages.conversationId, conversationId)];
  if (clearedAt) conditions.push(gt(messages.createdAt, clearedAt));
  if (cursor) conditions.push(lt(messages.createdAt, new Date(cursor)));

  const statusAgg = db
    .select({
      messageId: messageStatus.messageId,
      statusRank:
        sql<number>`MAX(CASE ${messageStatus.status} WHEN 'SEEN' THEN 2 WHEN 'DELIVERED' THEN 1 ELSE 0 END)`.as(
          'status_rank',
        ),
      seenAt: sql<Date | null>`MIN(${messageStatus.seenAt})`
        .mapWith((v: unknown) => (v === null || v === undefined ? null : new Date(v as string)))
        .as('seen_at'),
    })
    .from(messageStatus)
    .groupBy(messageStatus.messageId)
    .as('status_agg');

  const star = userId
    ? db
        .select({ messageId: messageStars.messageId, starredAt: messageStars.createdAt })
        .from(messageStars)
        .where(eq(messageStars.userId, userId))
        .as('star_agg')
    : undefined;

  const query = db
    .select({
      ...messageColumns,
      statusRank: statusAgg.statusRank,
      seenAt: statusAgg.seenAt,
      isStarred: star ? sql<boolean>`${star.messageId} IS NOT NULL` : sql<boolean>`false`,
      starredAt: star ? star.starredAt : sql<Date | null>`NULL`,
    })
    .from(messages)
    .leftJoin(statusAgg, eq(statusAgg.messageId, messages.id));

  if (star) query.leftJoin(star, eq(star.messageId, messages.id));

  return query
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);
}

export async function clearConversation(conversationId: string, userId: string) {
  const [row] = await db
    .update(conversationMembers)
    .set({ clearedAt: sql`now()` })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .returning({ clearedAt: conversationMembers.clearedAt });
  return row || null;
}

export async function setMutedUntil(
  conversationId: string,
  userId: string,
  mutedUntil: Date | null,
) {
  const [row] = await db
    .update(conversationMembers)
    .set({ mutedUntil })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .returning({ mutedUntil: conversationMembers.mutedUntil });
  return row || null;
}

export async function deleteConversation(conversationId: string) {
  await db.transaction(async (tx) => {
    const messageIds = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    if (messageIds.length > 0) {
      await tx.delete(notifications).where(
        inArray(
          notifications.messageId,
          messageIds.map((m) => m.id),
        ),
      );
    }
    await tx.delete(notifications).where(eq(notifications.conversationId, conversationId));
    await tx.delete(conversations).where(eq(conversations.id, conversationId));
  });
}

export async function findMessageById(id: string) {
  const [message] = await db
    .select(messageColumns)
    .from(messages)
    .where(eq(messages.id, id))
    .limit(1);
  return message || null;
}

export async function updateMessageContent(id: string, content: string) {
  const [message] = await db
    .update(messages)
    .set({ content, isEdited: true, editedAt: new Date(), updatedAt: new Date() })
    .where(eq(messages.id, id))
    .returning();
  return message || null;
}

export async function softDeleteMessage(id: string) {
  const [message] = await db
    .update(messages)
    .set({ isDeleted: true, content: '', updatedAt: new Date() })
    .where(eq(messages.id, id))
    .returning(messageColumns);
  return message || null;
}

export async function updateMessagePinned(id: string, isPinned: boolean) {
  const now = new Date();
  const [message] = await db
    .update(messages)
    .set({
      isPinned,
      pinnedAt: isPinned ? now : null,
      updatedAt: now,
    })
    .where(eq(messages.id, id))
    .returning(messageColumns);
  return message || null;
}

export async function findPinnedMessagesByConversation(conversationId: string, limit = 50) {
  return db
    .select({ ...messageColumns, ...pinnedMessageSenderColumns })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.isPinned, true),
        eq(messages.isDeleted, false),
        ne(messages.type, 'SYSTEM'),
      ),
    )
    .orderBy(desc(messages.pinnedAt), desc(messages.createdAt))
    .limit(limit);
}

export async function insertMessage(data: {
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
}) {
  const [message] = await db.insert(messages).values(data).returning();
  return message || null;
}

export async function insertMessageStatuses(
  rows: { messageId: string; userId: string; status: 'SENT' | 'DELIVERED' }[],
) {
  if (rows.length === 0) return;
  await db.insert(messageStatus).values(rows);
}

export async function findConversationMemberIds(conversationId: string) {
  return (
    await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId))
  ).map((row) => row.userId);
}

export async function findIncomingMessageIdsByConversation(conversationId: string, userId: string) {
  return (
    await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), ne(messages.senderId, userId)))
  ).map((row) => row.id);
}

export async function markMessagesSeen(userId: string, messageIds: string[], seenAt: Date) {
  const messageIdIn = (ids: string[]) =>
    sql`${messageStatus.messageId} = ANY(${`{${ids.join(',')}}`}::uuid[])`;

  const existingRows = await db
    .select({ messageId: messageStatus.messageId })
    .from(messageStatus)
    .where(and(eq(messageStatus.userId, userId), messageIdIn(messageIds)));
  const existingIds = new Set(existingRows.map((row) => row.messageId));

  const updated = await db
    .update(messageStatus)
    .set({ status: 'SEEN', seenAt, updatedAt: seenAt })
    .where(
      and(
        eq(messageStatus.userId, userId),
        ne(messageStatus.status, 'SEEN'),
        messageIdIn(messageIds),
      ),
    )
    .returning({ messageId: messageStatus.messageId });

  const newIds = messageIds.filter((id) => !existingIds.has(id));
  if (newIds.length > 0) {
    await db.insert(messageStatus).values(
      newIds.map((id) => ({
        messageId: id,
        userId,
        status: 'SEEN' as const,
        seenAt,
        updatedAt: seenAt,
      })),
    );
  }

  return [...new Set([...updated.map((row) => row.messageId), ...newIds])];
}

export async function findMessageSenders(messageIds: string[]) {
  if (messageIds.length === 0) return [];
  return db
    .select({ id: messages.id, senderId: messages.senderId })
    .from(messages)
    .where(inArray(messages.id, messageIds));
}

export async function addStar(messageId: string, userId: string) {
  await db.insert(messageStars).values({ messageId, userId }).onConflictDoNothing();
}

export async function removeStar(messageId: string, userId: string) {
  await db
    .delete(messageStars)
    .where(and(eq(messageStars.messageId, messageId), eq(messageStars.userId, userId)));
}

export async function findStarredMessages(userId: string, cursor?: string, limit = 50) {
  const stars = db
    .select({
      messageId: messageStars.messageId,
      starredAt: messageStars.createdAt,
    })
    .from(messageStars)
    .where(eq(messageStars.userId, userId))
    .as('stars');

  const senderUser = aliasedTable(users, 'star_sender');

  const conditions: SQL[] = [];
  if (cursor) conditions.push(lt(stars.starredAt, new Date(cursor)));

  return db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      senderId: messages.senderId,
      type: messages.type,
      content: messages.content,
      replyToId: messages.replyToId,
      isPinned: messages.isPinned,
      pinnedAt: messages.pinnedAt,
      isEdited: messages.isEdited,
      isDeleted: messages.isDeleted,
      editedAt: messages.editedAt,
      createdAt: messages.createdAt,
      starredAt: stars.starredAt,
      senderUsername: senderUser.username,
      senderFullName: senderUser.fullName,
      senderAvatarUrl: senderUser.avatarUrl,
      conversationType: conversations.type,
      conversationName: conversations.name,
      conversationAvatarUrl: conversations.avatarUrl,
    })
    .from(stars)
    .innerJoin(messages, eq(messages.id, stars.messageId))
    .innerJoin(senderUser, eq(senderUser.id, messages.senderId))
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(...conditions))
    .orderBy(desc(stars.starredAt), desc(messages.createdAt))
    .limit(limit + 1);
}

export async function findStar(messageId: string, userId: string) {
  const [row] = await db
    .select({ createdAt: messageStars.createdAt })
    .from(messageStars)
    .where(and(eq(messageStars.messageId, messageId), eq(messageStars.userId, userId)))
    .limit(1);
  return row || null;
}

export async function findReaction(messageId: string, userId: string, emoji: string) {
  const [row] = await db
    .select({ id: messageReactions.id })
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji),
      ),
    )
    .limit(1);
  return row || null;
}

export async function addReaction(messageId: string, userId: string, emoji: string) {
  await db.insert(messageReactions).values({ messageId, userId, emoji });
}

export async function removeReaction(messageId: string, userId: string, emoji: string) {
  await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji),
      ),
    );
}

export async function findReactionsByMessage(messageId: string) {
  return db
    .select({
      emoji: messageReactions.emoji,
      userId: messageReactions.userId,
    })
    .from(messageReactions)
    .where(eq(messageReactions.messageId, messageId));
}

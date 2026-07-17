import db from '../../db/index';
import { conversations } from '../../db/schema/conversations';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { messages } from '../../db/schema/messages';
import { eq, and, desc } from 'drizzle-orm';

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

export async function createConversation(data: { type: string; name?: string; createdBy: string }) {
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

export async function findConversationsByUserId(userId: string) {
  return db
    .select(conversationColumns)
    .from(conversations)
    .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
    .where(eq(conversationMembers.userId, userId))
    .orderBy(desc(conversations.createdAt));
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

export async function getLastMessage(conversationId: string) {
  const [result] = await db
    .select({
      id: messages.id,
      content: messages.content,
      type: messages.type,
      senderId: messages.senderId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return result || null;
}

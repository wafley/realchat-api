import db from '../../db/index';
import { blockedUsers } from '../../db/schema/blockedUsers';
import { users } from '../../db/schema/users';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { eq, and } from 'drizzle-orm';

export async function insertBlock(blockerId: string, blockedId: string) {
  await db.insert(blockedUsers).values({ blockerId, blockedId });
}

export async function deleteBlock(blockerId: string, blockedId: string) {
  await db
    .delete(blockedUsers)
    .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)));
}

export async function findBlock(blockerId: string, blockedId: string) {
  const [row] = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)))
    .limit(1);
  return row ?? null;
}

export async function listBlocked(blockerId: string) {
  return db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      statusText: users.statusText,
      isOnline: users.isOnline,
      lastSeenAt: users.lastSeenAt,
    })
    .from(blockedUsers)
    .innerJoin(users, eq(users.id, blockedUsers.blockedId))
    .where(eq(blockedUsers.blockerId, blockerId))
    .orderBy(blockedUsers.createdAt);
}

export async function isBlockedByUser(blockerId: string, blockedId: string) {
  const [row] = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)))
    .limit(1);
  return !!row;
}

export async function isBlockedByAnyMember(conversationId: string, blockedUserId: string) {
  const [row] = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .innerJoin(conversationMembers, eq(conversationMembers.userId, blockedUsers.blockerId))
    .where(
      and(
        eq(blockedUsers.blockedId, blockedUserId),
        eq(conversationMembers.conversationId, conversationId),
      ),
    )
    .limit(1);
  return !!row;
}

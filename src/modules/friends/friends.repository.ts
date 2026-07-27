import db from '../../db/index';
import { follows } from '../../db/schema/follows';
import { eq, and, desc } from 'drizzle-orm';

export const followColumns = {
  id: follows.id,
  followerId: follows.followerId,
  followingId: follows.followingId,
  createdAt: follows.createdAt,
};

export async function follow(followerId: string, followingId: string) {
  const existing = await findFollow(followerId, followingId);
  if (existing) return existing;

  const [follow] = await db
    .insert(follows)
    .values({ followerId, followingId })
    .returning(followColumns);
  return follow;
}

export async function unfollow(followerId: string, followingId: string) {
  await db
    .delete(follows)
    .where(
      and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)),
    );
}

export async function findFollow(followerId: string, followingId: string) {
  const [follow] = await db
    .select(followColumns)
    .from(follows)
    .where(
      and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)),
    )
    .limit(1);
  return follow || null;
}

export async function findFollowing(userId: string, sort?: string) {
  const query = db
    .select(followColumns)
    .from(follows)
    .where(eq(follows.followerId, userId));

  if (sort === 'alphabetical') {
    return query;
  }
  return query.orderBy(desc(follows.createdAt));
}

export async function findFollowers(userId: string) {
  return db
    .select(followColumns)
    .from(follows)
    .where(eq(follows.followingId, userId))
    .orderBy(desc(follows.createdAt));
}

export async function findFollowingIds(userId: string) {
  const rows = await db
    .select({ id: follows.followingId })
    .from(follows)
    .where(eq(follows.followerId, userId));
  return rows.map((r) => r.id);
}

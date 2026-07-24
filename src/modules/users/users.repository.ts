import db from '../../db/index';
import { users } from '../../db/schema/users';
import { and, eq, ilike, ne, or } from 'drizzle-orm';

export const publicUserColumns = {
  id: users.id,
  username: users.username,
  email: users.email,
  fullName: users.fullName,
  bio: users.bio,
  avatarUrl: users.avatarUrl,
  statusText: users.statusText,
  isOnline: users.isOnline,
  lastSeenAt: users.lastSeenAt,
  isVerified: users.isVerified,
  createdAt: users.createdAt,
};

export async function updateUser(
  userId: string,
  data: { username?: string; fullName?: string; bio?: string | null; statusText?: string },
) {
  const [user] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning(publicUserColumns);
  return user || null;
}

export async function searchUsers(query: string, excludeUserId?: string) {
  const pattern = `%${query}%`;
  return db
    .select(publicUserColumns)
    .from(users)
    .where(
      and(
        eq(users.isVerified, true),
        excludeUserId ? ne(users.id, excludeUserId) : undefined,
        or(ilike(users.username, pattern), ilike(users.email, pattern)),
      ),
    )
    .limit(20);
}

export async function updateAvatar(userId: string, avatarUrl: string) {
  const [user] = await db
    .update(users)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning(publicUserColumns);
  return user || null;
}

export async function changePassword(userId: string, passwordHash: string) {
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
}

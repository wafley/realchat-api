import db from '../../db/index';
import { users } from '../../db/schema/users';
import { eq, ilike, or } from 'drizzle-orm';

export const publicUserColumns = {
  id: users.id,
  username: users.username,
  email: users.email,
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
  data: { username?: string; bio?: string | null; statusText?: string },
) {
  const [user] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning(publicUserColumns);
  return user || null;
}

export async function searchUsers(query: string) {
  const pattern = `%${query}%`;
  return db
    .select(publicUserColumns)
    .from(users)
    .where(or(ilike(users.username, pattern), ilike(users.email, pattern)))
    .limit(20);
}

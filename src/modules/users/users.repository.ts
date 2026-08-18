import db from '../../db/index';
import { users } from '../../db/schema/users';
import { refreshTokens } from '../../db/schema/refreshTokens';
import { eq } from 'drizzle-orm';

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
  usernameUpdatedAt: users.usernameUpdatedAt,
};

export async function updateUser(
  userId: string,
  data: {
    username?: string;
    fullName?: string;
    bio?: string | null;
    statusText?: string;
    usernameUpdatedAt?: Date;
  },
) {
  const [user] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning(publicUserColumns);
  return user || null;
}

export async function updateAvatar(userId: string, avatarUrl: string) {
  const [user] = await db
    .update(users)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning(publicUserColumns);
  return user || null;
}

export async function changePasswordAtomically(userId: string, passwordHash: string) {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  });
}

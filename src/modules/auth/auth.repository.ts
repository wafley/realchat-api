import db from '../../db/index';
import { users } from '../../db/schema/users';
import { refreshTokens } from '../../db/schema/refreshTokens';
import { eq, and, gt } from 'drizzle-orm';

export async function createUser(data: { username: string; email: string; passwordHash: string }) {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user || null;
}

export async function findUserByUsername(username: string) {
  const [user] = await db.select().from(users).where(eq(users.username, username));
  return user || null;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || null;
}

export async function saveRefreshToken(data: { userId: string; token: string; expiredAt: Date }) {
  const [refreshToken] = await db.insert(refreshTokens).values(data).returning();
  return refreshToken;
}

export async function findRefreshToken(token: string) {
  const now = new Date();
  const [refreshToken] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.token, token), gt(refreshTokens.expiredAt, now)));
  return refreshToken || null;
}

export async function deleteRefreshToken(token: string) {
  await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
}

export async function updatePassword(userId: string, passwordHash: string) {
  const [user] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

export async function saveResetToken(userId: string, resetToken: string, expiresAt: Date) {
  const [user] = await db
    .update(users)
    .set({ resetToken, resetTokenExpiresAt: expiresAt })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

export async function findUserByResetToken(resetToken: string) {
  const now = new Date();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.resetToken, resetToken), gt(users.resetTokenExpiresAt, now)));
  return user || null;
}

export async function clearResetToken(userId: string) {
  const [user] = await db
    .update(users)
    .set({ resetToken: null, resetTokenExpiresAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

export async function updateVerifiedStatus(userId: string) {
  const [user] = await db
    .update(users)
    .set({ isVerified: true, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

export async function saveVerificationToken(userId: string, token: string, expiresAt: Date) {
  const [user] = await db
    .update(users)
    .set({ verificationToken: token, verificationTokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

export async function findUserByVerificationToken(token: string) {
  const now = new Date();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.verificationToken, token), gt(users.verificationTokenExpiresAt, now)));
  return user || null;
}

export async function clearVerificationToken(userId: string) {
  const [user] = await db
    .update(users)
    .set({ verificationToken: null, verificationTokenExpiresAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

export async function deleteUserRefreshTokens(userId: string) {
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
}

import db from '../../db/index';
import { users } from '../../db/schema/users';
import { refreshTokens } from '../../db/schema/refreshTokens';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { contacts } from '../../db/schema/contacts';
import { blockedUsers } from '../../db/schema/blockedUsers';
import { messageStars } from '../../db/schema/messageStars';
import { messageReactions } from '../../db/schema/messageReactions';
import { deviceTokens } from '../../db/schema/deviceTokens';
import { notifications } from '../../db/schema/notifications';
import { eq, or, and, gt, inArray, isNull, sql } from 'drizzle-orm';

export async function createUser(data: {
  username: string;
  email: string;
  passwordHash: string;
  fullName?: string;
}) {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`);
  return user || null;
}

export async function findUserByUsername(username: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`);
  return user || null;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || null;
}

export async function findUsersByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
}

export async function findUserIdsByUsernames(usernames: string[]) {
  if (usernames.length === 0) return [];
  const lowerUsernames = usernames.map((u) => u.toLowerCase());
  return db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(sql`lower(${users.username})`, lowerUsernames));
}

export async function saveRefreshToken(data: {
  userId: string;
  token: string;
  jti: string;
  familyId: string;
  parentJti?: string | null;
  expiredAt: Date;
}) {
  const [refreshToken] = await db.insert(refreshTokens).values(data).returning();
  return refreshToken;
}

export async function findRefreshTokenByJti(jti: string) {
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.jti, jti)).limit(1);
  return row || null;
}

export async function revokeRefreshFamily(familyId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

export async function revokeAllUserRefreshTokens(userId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function rotateRefreshToken(params: {
  oldJti: string;
  familyId: string;
  userId: string;
  newToken: string;
  newJti: string;
  parentJti: string;
  expiredAt: Date;
}): Promise<boolean> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.jti, params.oldJti), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    if (updated.length === 0) {
      return false;
    }
    await tx.insert(refreshTokens).values({
      userId: params.userId,
      token: params.newToken,
      jti: params.newJti,
      familyId: params.familyId,
      parentJti: params.parentJti,
      expiredAt: params.expiredAt,
    });
    return true;
  });
}

export async function updatePassword(userId: string, passwordHash: string) {
  const [user] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date(), tokenVersion: sql`${users.tokenVersion} + 1` })
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
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function findUserConversationIds(userId: string) {
  return (
    await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId))
  ).map((row) => row.conversationId);
}

export async function anonymizeUser(
  userId: string,
  data: { username: string; email: string; passwordHash: string },
) {
  return db.transaction(async (tx) => {
    await tx
      .delete(contacts)
      .where(or(eq(contacts.userId, userId), eq(contacts.contactId, userId)));
    await tx
      .delete(blockedUsers)
      .where(or(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId)));
    await tx.delete(messageStars).where(eq(messageStars.userId, userId));
    await tx.delete(messageReactions).where(eq(messageReactions.userId, userId));
    await tx.delete(deviceTokens).where(eq(deviceTokens.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));

    const [user] = await tx
      .update(users)
      .set({
        username: data.username,
        email: data.email,
        passwordHash: data.passwordHash,
        fullName: null,
        bio: null,
        statusText: null,
        avatarUrl: null,
        isOnline: false,
        lastSeenAt: new Date(),
        isVerified: true,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        resetToken: null,
        resetTokenExpiresAt: null,
        verificationToken: null,
        verificationTokenExpiresAt: null,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return user || null;
  });
}

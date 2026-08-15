import db from '../../db/index';
import { deviceTokens } from '../../db/schema/deviceTokens';
import { eq, and, inArray, asc } from 'drizzle-orm';

export async function upsertDeviceToken(userId: string, token: string, platform: string) {
  const [row] = await db
    .insert(deviceTokens)
    .values({ userId, token, platform })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: { userId, platform, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function removeDeviceToken(userId: string, token: string) {
  await db
    .delete(deviceTokens)
    .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token)));
}

export async function findTokensByUserIds(userIds: string[]) {
  if (userIds.length === 0) return [];
  return db
    .select({
      userId: deviceTokens.userId,
      token: deviceTokens.token,
      platform: deviceTokens.platform,
    })
    .from(deviceTokens)
    .where(inArray(deviceTokens.userId, userIds));
}

export async function removeDeviceTokens(tokens: string[]) {
  if (tokens.length === 0) return;
  await db.delete(deviceTokens).where(inArray(deviceTokens.token, tokens));
}

export async function trimTokensForUser(userId: string, max: number) {
  const rows = await db
    .select({ id: deviceTokens.id })
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId))
    .orderBy(asc(deviceTokens.createdAt));
  if (rows.length <= max) return;
  const excess = rows.slice(0, rows.length - max).map((r) => r.id);
  await db.delete(deviceTokens).where(inArray(deviceTokens.id, excess));
}

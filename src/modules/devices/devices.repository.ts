import db from '../../db/index';
import { deviceTokens } from '../../db/schema/deviceTokens';
import { eq, and, inArray } from 'drizzle-orm';

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

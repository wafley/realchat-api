/**
 * Lapisan akses data (Drizzle ORM) untuk tabel device_tokens: upsert token FCM,
 * pencarian token per kumpulan user, penghapusan token, dan pemangkasan token
 * terlama agar jumlah per user tetap dalam batas.
 */
import db from '../../db/index';
import { deviceTokens } from '../../db/schema/deviceTokens';
import { eq, and, inArray, asc } from 'drizzle-orm';

/**
 * Menyisipkan token baru atau memperbarui pemilik/platform-nya bila token
 * sudah ada (konflik pada kolom token yang unik).
 */
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

/** Menghapus satu token milik user tertentu (dipakai saat unregister). */
export async function removeDeviceToken(userId: string, token: string) {
  await db
    .delete(deviceTokens)
    .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token)));
}

/** Mengambil semua token FCM milik sekumpulan user (untuk fan-out push). */
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

/**
 * Menghapus banyak token sekaligus tanpa memandang pemiliknya; dipakai
 * pembersihan token FCM yang sudah tidak terdaftar (invalid token).
 */
export async function removeDeviceTokens(tokens: string[]) {
  if (tokens.length === 0) return;
  await db.delete(deviceTokens).where(inArray(deviceTokens.token, tokens));
}

/**
 * Membatasi jumlah token per user: jika melebihi `max`, token dengan
 * createdAt paling lama dihapus terlebih dahulu (FIFO).
 */
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

/**
 * Lapisan akses data pengguna: pembaruan profil, avatar, dan pergantian
 * password atomik. Mengembalikan kolom publik agar data sensitif tidak bocor.
 */
import db from '../../db/index';
import { users } from '../../db/schema/users';
import { refreshTokens } from '../../db/schema/refreshTokens';
import { eq, sql, inArray, and } from 'drizzle-orm';

/** Daftar kolom pengguna yang aman untuk dikirim ke klien (tanpa hash password). */
export const publicUserColumns = {
  id: users.id,
  username: users.username,
  email: users.email,
  fullName: users.fullName,
  bio: users.bio,
  avatarUrl: users.avatarUrl,
  bannerUrl: users.bannerUrl,
  statusText: users.statusText,
  isOnline: users.isOnline,
  lastSeenAt: users.lastSeenAt,
  isVerified: users.isVerified,
  createdAt: users.createdAt,
  usernameUpdatedAt: users.usernameUpdatedAt,
};

/** Memperbarui field profil pengguna dan mengembalikan data publik terbaru. */
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

/** Menyimpan URL avatar baru dan mengembalikan data publik terbaru. */
export async function updateAvatar(userId: string, avatarUrl: string) {
  const [user] = await db
    .update(users)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning(publicUserColumns);
  return user || null;
}

/** Menyimpan URL banner baru dan mengembalikan data publik terbaru. */
export async function updateBanner(userId: string, bannerUrl: string) {
  const [user] = await db
    .update(users)
    .set({ bannerUrl, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning(publicUserColumns);
  return user || null;
}

/** Mengambil pengaturan privasi pengguna; null jika pengguna tidak ada. */
export async function findPrivacySettings(userId: string) {
  const [row] = await db
    .select({
      lastSeenVisibility: users.lastSeenVisibility,
      groupInvitePolicy: users.groupInvitePolicy,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row || null;
}

/** Mengambil preferensi notifikasi pengguna; null jika pengguna tidak ada. */
export async function findNotificationPreferences(userId: string) {
  const [row] = await db
    .select({
      notifyNewMessages: users.notifyNewMessages,
      notifyGroupInvites: users.notifyGroupInvites,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row || null;
}

/**
 * Mengambil setting visibilitas last seen banyak pengguna sekaligus
 * (satu query) untuk penyaringan kehadiran pada daftar.
 */
export async function findPresenceTargets(userIds: string[]) {
  if (userIds.length === 0) return [];
  return db
    .select({ id: users.id, lastSeenVisibility: users.lastSeenVisibility })
    .from(users)
    .where(inArray(users.id, userIds));
}

/**
 * Kumpulan ID pengguna yang mematikan push pesan masuk (notifyNewMessages
 * = false); satu query untuk seluruh kandidat penerima.
 */
export async function findNewMessageOptOuts(userIds: string[]) {
  if (userIds.length === 0) return new Set<string>();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, userIds), eq(users.notifyNewMessages, false)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Kumpulan ID pengguna yang mematikan notifikasi undangan grup
 * (notifyGroupInvites = false); satu query untuk seluruh kandidat.
 */
export async function findGroupInviteOptOuts(userIds: string[]) {
  if (userIds.length === 0) return new Set<string>();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, userIds), eq(users.notifyGroupInvites, false)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Memperbarui sebagian pengaturan privasi dan mengembalikan nilai terbaru.
 * Hanya field yang dikirim yang berubah.
 */
export async function updatePrivacySettings(
  userId: string,
  data: { lastSeenVisibility?: string; groupInvitePolicy?: string },
) {
  const [row] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({
      lastSeenVisibility: users.lastSeenVisibility,
      groupInvitePolicy: users.groupInvitePolicy,
    });
  return row || null;
}

/**
 * Memperbarui sebagian preferensi notifikasi dan mengembalikan nilai terbaru.
 * Hanya field yang dikirim yang berubah.
 */
export async function updateNotificationPreferences(
  userId: string,
  data: { notifyNewMessages?: boolean; notifyGroupInvites?: boolean },
) {
  const [row] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({
      notifyNewMessages: users.notifyNewMessages,
      notifyGroupInvites: users.notifyGroupInvites,
    });
  return row || null;
}

/**
 * Mengganti password secara atomik dalam satu transaksi: hash baru disimpan
 * dan tokenVersion dinaikkan, lalu seluruh refresh token pengguna dihapus
 * agar sesi lama tidak bisa diperbarui.
 */
export async function changePasswordAtomically(userId: string, passwordHash: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date(), tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, userId));
    await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  });
}

/**
 * Set password tanpa invalidate sesi — untuk OAuth user yang pertama kali
 * menyetel sandi. Tidak mengubah tokenVersion atau menghapus refresh token.
 */
export async function setPasswordHash(userId: string, passwordHash: string) {
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

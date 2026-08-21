/**
 * Lapisan akses data pengguna: pembaruan profil, avatar, dan pergantian
 * password atomik. Mengembalikan kolom publik agar data sensitif tidak bocor.
 */
import db from '../../db/index';
import { users } from '../../db/schema/users';
import { refreshTokens } from '../../db/schema/refreshTokens';
import { eq, sql } from 'drizzle-orm';

/** Daftar kolom pengguna yang aman untuk dikirim ke klien (tanpa hash password). */
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

/**
 * Mengganti password secara atomik dalam satu transaksi: hash baru disimpan
 * dan tokenVersion dinaikkan, lalu seluruh refresh token pengguna dihapus
 * agar sesi lama tidak bisa diperbarui.
 */
export async function changePasswordAtomically(userId: string, passwordHash: string) {
  await db.transaction(async (tx) => {
    // tokenVersion naik: access token lama otomatis ditolak oleh verifyJWT.
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date(), tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, userId));
    await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  });
}

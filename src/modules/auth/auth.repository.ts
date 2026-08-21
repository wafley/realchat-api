/**
 * Lapisan akses data untuk modul autentikasi: CRUD pengguna, penyimpanan
 * dan rotasi refresh token, token reset/verifikasi email, serta anonimisasi
 * akun saat penghapusan. Hanya berisi query Drizzle tanpa logika bisnis.
 */
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

/** Menyimpan pengguna baru beserta hash password-nya. */
export async function createUser(data: {
  username: string;
  email: string;
  passwordHash: string;
  fullName?: string;
}) {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}

/**
 * Mencari pengguna berdasarkan email secara case-insensitive.
 * @returns pengguna yang cocok, atau null jika tidak ditemukan
 */
export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    // Pencocokan lower() agar "A@x.com" dan "a@x.com" dianggap sama.
    .where(sql`lower(${users.email}) = lower(${email})`);
  return user || null;
}

/**
 * Mencari pengguna berdasarkan username secara case-insensitive.
 * @returns pengguna yang cocok, atau null jika tidak ditemukan
 */
export async function findUserByUsername(username: string) {
  const [user] = await db
    .select()
    .from(users)
    // Pencocokan lower() agar perbedaan huruf besar/kecil diabaikan.
    .where(sql`lower(${users.username}) = lower(${username})`);
  return user || null;
}

/** Mengambil satu pengguna berdasarkan ID (termasuk yang sudah dihapus). */
export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || null;
}

/** Memeriksa keberadaan banyak pengguna sekaligus; hanya ID yang dikembalikan. */
export async function findUsersByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
}

/**
 * Memetakan daftar username menjadi ID pengguna (pencocokan case-insensitive).
 * @returns pasangan {id, username} untuk username yang terdaftar
 */
export async function findUserIdsByUsernames(usernames: string[]) {
  if (usernames.length === 0) return [];
  const lowerUsernames = usernames.map((u) => u.toLowerCase());
  return db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(sql`lower(${users.username})`, lowerUsernames));
}

/** Menyimpan refresh token baru beserta jti, keluarga (family), dan kedaluwarsanya. */
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

/** Mencari baris refresh token berdasarkan jti dari payload JWT. */
export async function findRefreshTokenByJti(jti: string) {
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.jti, jti)).limit(1);
  return row || null;
}

/** Mencabut semua token dalam satu keluarga (dipakai saat reuse terdeteksi). */
export async function revokeRefreshFamily(familyId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

/** Mencabut seluruh refresh token aktif milik seorang pengguna. */
export async function revokeAllUserRefreshTokens(userId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/**
 * Merotasi refresh token secara atomik: token lama dicabut lalu token baru
 * disisipkan dalam satu transaksi. Gagal revoke (token sudah dipakai/hilang)
 * mengembalikan false sebagai sinyal deteksi reuse.
 * @returns true jika rotasi berhasil, false jika token lama sudah dicabut
 */
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
    // Revoke bersyarat: hanya berhasil jika token lama belum pernah dicabut.
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

/**
 * Mengganti hash password sekaligus menaikkan tokenVersion agar semua
 * access token lama otomatis tidak berlaku.
 */
export async function updatePassword(userId: string, passwordHash: string) {
  const [user] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date(), tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

/** Menyimpan token reset password beserta waktu kedaluwarsanya. */
export async function saveResetToken(userId: string, resetToken: string, expiresAt: Date) {
  const [user] = await db
    .update(users)
    .set({ resetToken, resetTokenExpiresAt: expiresAt })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

/** Mencari pengguna berdasarkan token reset yang masih berlaku (belum kedaluwarsa). */
export async function findUserByResetToken(resetToken: string) {
  const now = new Date();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.resetToken, resetToken), gt(users.resetTokenExpiresAt, now)));
  return user || null;
}

/** Menghapus token reset password setelah dipakai agar tidak bisa dipakai ulang. */
export async function clearResetToken(userId: string) {
  const [user] = await db
    .update(users)
    .set({ resetToken: null, resetTokenExpiresAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

/** Menandai akun sebagai terverifikasi (isVerified = true). */
export async function updateVerifiedStatus(userId: string) {
  const [user] = await db
    .update(users)
    .set({ isVerified: true, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

/** Menyimpan token verifikasi email beserta waktu kedaluwarsanya. */
export async function saveVerificationToken(userId: string, token: string, expiresAt: Date) {
  const [user] = await db
    .update(users)
    .set({ verificationToken: token, verificationTokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

/** Mencari pengguna berdasarkan token verifikasi yang masih berlaku. */
export async function findUserByVerificationToken(token: string) {
  const now = new Date();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.verificationToken, token), gt(users.verificationTokenExpiresAt, now)));
  return user || null;
}

/** Menghapus token verifikasi setelah email berhasil diverifikasi. */
export async function clearVerificationToken(userId: string) {
  const [user] = await db
    .update(users)
    .set({ verificationToken: null, verificationTokenExpiresAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

/** Mencabut semua refresh token aktif pengguna (dipakai saat reset password). */
export async function deleteUserRefreshTokens(userId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/** Mengambil semua ID percakapan tempat pengguna menjadi anggota. */
export async function findUserConversationIds(userId: string) {
  return (
    await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId))
  ).map((row) => row.conversationId);
}

/**
 * Menganonimkan akun yang dihapus dalam satu transaksi: menghapus kontak,
 * blokiran, bintang, reaksi, device token, dan notifikasi milik pengguna,
 * lalu menimpa identitas (username/email/password) dengan nilai acak dan
 * menandai deletedAt. Riwayat pesan tetap ada tanpa membuka identitas asli.
 */
export async function anonymizeUser(
  userId: string,
  data: { username: string; email: string; passwordHash: string },
) {
  return db.transaction(async (tx) => {
    // Hapus data relasional yang terikat identitas pengguna.
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

    // Timpa identitas dengan nilai acak; tokenVersion naik agar token lama mati.
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
        bannerUrl: null,
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

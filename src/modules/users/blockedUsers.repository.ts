/**
 * Lapisan akses data relasi blokir antar pengguna: insert/delete blokir,
 * pemeriksaan status blokir (termasuk konteks anggota percakapan), dan
 * pengambilan daftar ID terkait untuk penyembunyian kehadiran.
 */
import db from '../../db/index';
import { blockedUsers } from '../../db/schema/blockedUsers';
import { users } from '../../db/schema/users';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { eq, and, or } from 'drizzle-orm';

/** Mencatat relasi blokir baru dari blocker ke blocked. */
export async function insertBlock(blockerId: string, blockedId: string) {
  await db.insert(blockedUsers).values({ blockerId, blockedId });
}

/** Menghapus relasi blokir antara blocker dan blocked. */
export async function deleteBlock(blockerId: string, blockedId: string) {
  await db
    .delete(blockedUsers)
    .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)));
}

/** Mencari relasi blokir spesifik; null jika tidak ada. */
export async function findBlock(blockerId: string, blockedId: string) {
  const [row] = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)))
    .limit(1);
  return row ?? null;
}

/** Mengembalikan daftar profil pengguna yang diblokir, urut dari yang terlama. */
export async function listBlocked(blockerId: string) {
  return db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      statusText: users.statusText,
      isOnline: users.isOnline,
      lastSeenAt: users.lastSeenAt,
    })
    .from(blockedUsers)
    .innerJoin(users, eq(users.id, blockedUsers.blockedId))
    .where(eq(blockedUsers.blockerId, blockerId))
    .orderBy(blockedUsers.createdAt);
}

/** Memeriksa apakah blockedId diblokir oleh blockerId. */
export async function isBlockedByUser(blockerId: string, blockedId: string) {
  const [row] = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)))
    .limit(1);
  return !!row;
}

/**
 * Memeriksa apakah blockedUserId diblokir oleh salah satu anggota
 * percakapan (dipakai untuk menyaring pesan di percakapan grup).
 */
export async function isBlockedByAnyMember(conversationId: string, blockedUserId: string) {
  const [row] = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .innerJoin(conversationMembers, eq(conversationMembers.userId, blockedUsers.blockerId))
    .where(
      and(
        eq(blockedUsers.blockedId, blockedUserId),
        eq(conversationMembers.conversationId, conversationId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Memeriksa apakah blockerUserId memblokir salah satu anggota percakapan
 * (dipakai misalnya saat menambahkan anggota baru ke grup).
 */
export async function hasBlockedAnyMember(conversationId: string, blockerUserId: string) {
  const [row] = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .innerJoin(conversationMembers, eq(conversationMembers.userId, blockedUsers.blockedId))
    .where(
      and(
        eq(blockedUsers.blockerId, blockerUserId),
        eq(conversationMembers.conversationId, conversationId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Memeriksa apakah ada blokir dua arah antara dua pengguna (A memblokir B
 * atau sebaliknya); dipakai untuk menyembunyikan kehadiran.
 */
export async function hasBlockRelation(userIdA: string, userIdB: string) {
  const [row] = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .where(
      or(
        and(eq(blockedUsers.blockerId, userIdA), eq(blockedUsers.blockedId, userIdB)),
        and(eq(blockedUsers.blockerId, userIdB), eq(blockedUsers.blockedId, userIdA)),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Mengumpulkan semua ID pengguna yang terlibat relasi blokir dengan userId
 * (baik sebagai blocker maupun yang diblokir), tidak termasuk dirinya.
 */
export async function getBlockRelationUserIds(userId: string) {
  const rows = await db
    .select({ blockerId: blockedUsers.blockerId, blockedId: blockedUsers.blockedId })
    .from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId)));
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.blockerId !== userId) ids.add(row.blockerId);
    if (row.blockedId !== userId) ids.add(row.blockedId);
  }
  return ids;
}

/**
 * Lapisan akses data (Drizzle ORM) untuk pencarian: user, grup, pesan grup/DM.
 * Query memakai ILIKE dengan escaping karakter khusus LIKE, filter relasi blokir
 * via notExists, alias tabel untuk self-join, dan paginasi cursor limit+1.
 */
import db from '../../db/index';
import { users } from '../../db/schema/users';
import { conversations } from '../../db/schema/conversations';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { messages } from '../../db/schema/messages';
import {
  eq,
  and,
  or,
  ne,
  lt,
  gt,
  desc,
  count,
  ilike,
  sql,
  isNull,
  notExists,
  aliasedTable,
  type SQL,
} from 'drizzle-orm';
import { blockedUsers } from '../../db/schema/blockedUsers';

// Alias self-join tabel users untuk mengambil data pengirim pesan.
const senderUser = aliasedTable(users, 'sender_user');

/** Kolom pesan yang diambil pada semua query pencarian pesan. */
const messageColumns = {
  id: messages.id,
  conversationId: messages.conversationId,
  senderId: messages.senderId,
  type: messages.type,
  content: messages.content,
  isPinned: messages.isPinned,
  isEdited: messages.isEdited,
  isDeleted: messages.isDeleted,
  isForwarded: messages.isForwarded,
  forwardCount: messages.forwardCount,
  createdAt: messages.createdAt,
};

// Escape karakter khusus LIKE (\, %, _) agar input user tidak bertindak
// sebagai wildcard dan query ILIKE tetap aman dari pola tak terduga.
function escapeLike(q: string) {
  return q.replace(/[\\%_]/g, '\\$&');
}

/** Memeriksa apakah user merupakan anggota percakapan tertentu. */
export async function isConversationMember(conversationId: string, userId: string) {
  const [result] = await db
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return !!result;
}

/**
 * Mencari user terverifikasi (belum dihapus) berdasarkan username/nama lengkap.
 * Hasil tidak memuat user yang punya relasi blokir dua arah dengan pencari,
 * diurutkan dari yang online lalu nama pengguna secara alfabetis.
 */
export async function searchUsers(currentUserId: string, q: string, limit = 50) {
  const pattern = `%${escapeLike(q)}%`;
  // notExists: hanya sertakan user yang TIDAK punya baris blokir dua arah
  // (pencari memblokir dia, atau dia memblokir pencari).
  const noBlockRelation = notExists(
    db
      .select({ id: blockedUsers.id })
      .from(blockedUsers)
      .where(
        or(
          and(eq(blockedUsers.blockerId, currentUserId), eq(blockedUsers.blockedId, users.id)),
          and(eq(blockedUsers.blockerId, users.id), eq(blockedUsers.blockedId, currentUserId)),
        ),
      ),
  );
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      statusText: users.statusText,
      isOnline: users.isOnline,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(
      and(
        ne(users.id, currentUserId),
        eq(users.isVerified, true),
        isNull(users.deletedAt),
        or(ilike(users.username, pattern), ilike(users.fullName, pattern))!,
        noBlockRelation,
      ),
    )
    // Urutkan hanya berdasarkan username: mengurutkan berdasarkan isOnline
    // akan membocorkan status kehadiran pengguna yang menyembunyikannya.
    .orderBy(users.username)
    .limit(limit);
  return rows;
}

/**
 * Mencari grup yang diikuti user berdasarkan nama, dengan jumlah anggota
 * (subquery agregat) dan paginasi cursor createdAt menurun. Mengambil
 * limit+1 baris agar service bisa mendeteksi halaman berikutnya.
 */
export async function searchGroups(currentUserId: string, q: string, cursor?: string, limit = 50) {
  const pattern = `%${escapeLike(q)}%`;
  // Subquery hitung anggota per percakapan, dipakai sebagai left join.
  const memberCounts = db
    .select({
      conversationId: conversationMembers.conversationId,
      value: count(conversationMembers.id).as('member_count'),
    })
    .from(conversationMembers)
    .groupBy(conversationMembers.conversationId)
    .as('member_counts');

  // Subquery daftar percakapan yang diikuti pencari; inner join membatasi
  // hasil hanya pada grup miliknya sendiri.
  const mine = db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, currentUserId))
    .as('mine');

  const conditions: SQL[] = [eq(conversations.type, 'GROUP'), ilike(conversations.name, pattern)];
  // Cursor pagination: ambil baris yang dibuat sebelum cursor (createdAt menurun).
  if (cursor) conditions.push(lt(conversations.createdAt, new Date(cursor)));

  const rows = await db
    .select({
      id: conversations.id,
      name: conversations.name,
      avatarUrl: conversations.avatarUrl,
      description: conversations.description,
      createdBy: conversations.createdBy,
      createdAt: conversations.createdAt,
      memberCount: memberCounts.value,
    })
    .from(conversations)
    .innerJoin(mine, eq(mine.conversationId, conversations.id))
    .leftJoin(memberCounts, eq(memberCounts.conversationId, conversations.id))
    .where(and(...conditions))
    .orderBy(desc(conversations.createdAt))
    // limit+1 untuk mendeteksi adanya halaman berikutnya.
    .limit(limit + 1);
  return rows;
}

/**
 * Mencari pesan berdasarkan konten. Bila conversationId diberikan, pencarian
 * terbatas pada percakapan itu; jika tidak, hasil dibatasi percakapan yang
 * diikuti user dan tidak disembunyikan. Mendukung filter rentang waktu
 * (before/after) dan cursor pagination; mengembalikan limit+1 baris.
 */
export async function searchMessages(
  userId: string,
  options: {
    conversationId?: string;
    q: string;
    before?: Date;
    after?: Date;
    cursor?: string;
    limit?: number;
  },
) {
  const { conversationId, q, before, after, cursor, limit = 50 } = options;
  const pattern = `%${escapeLike(q)}%`;

  const conditions: SQL[] = [eq(messages.isDeleted, false), ilike(messages.content, pattern)];
  if (conversationId) {
    conditions.push(eq(messages.conversationId, conversationId));
  } else {
    // Mode global: batasi ke percakapan yang diikuti user dan belum disembunyikan.
    conditions.push(
      eq(conversationMembers.conversationId, messages.conversationId),
      eq(conversationMembers.userId, userId),
      isNull(conversationMembers.hiddenAt),
    );
  }
  if (before) conditions.push(lt(messages.createdAt, before));
  if (after) conditions.push(gt(messages.createdAt, after));
  // Cursor pagination berbasis createdAt pesan.
  if (cursor) conditions.push(lt(messages.createdAt, new Date(cursor)));

  let query = db
    .select({
      ...messageColumns,
      senderUsername: senderUser.username,
      senderFullName: senderUser.fullName,
    })
    .from(messages)
    .innerJoin(senderUser, eq(senderUser.id, messages.senderId));

  // Tanpa conversationId, perlu join ke anggota untuk filter keanggotaan user.
  if (!conversationId) {
    query = query.innerJoin(
      conversationMembers,
      eq(conversationMembers.conversationId, messages.conversationId),
    );
  }

  return query
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);
}

/**
 * Mencari pesan di semua percakapan pribadi (PRIVATE) milik user. Memakai
 * alias ganda conversationMembers untuk memisahkan keanggotaan pencari (mine)
 * dan lawan bicara (peer), lalu menampilkan nama lawan/pengirim dengan
 * fallback ke username. Mengembalikan limit+1 baris untuk cursor pagination.
 */
export async function searchDmMessages(userId: string, q: string, cursor?: string, limit = 50) {
  const pattern = `%${escapeLike(q)}%`;
  // Alias self-join: peer = user lawan bicara, mine/peerMember = baris
  // keanggotaan milik pencari dan lawan bicara pada percakapan yang sama.
  const peer = aliasedTable(users, 'peer_user');
  const mine = aliasedTable(conversationMembers, 'mine');
  const peerMember = aliasedTable(conversationMembers, 'peer_member');

  const conditions: SQL[] = [
    eq(messages.isDeleted, false),
    ilike(messages.content, pattern),
    eq(conversations.type, 'PRIVATE'),
    eq(mine.conversationId, messages.conversationId),
    eq(mine.userId, userId),
    isNull(mine.hiddenAt),
    eq(peerMember.conversationId, messages.conversationId),
    ne(peerMember.userId, userId),
    eq(peer.id, peerMember.userId),
  ];
  // Cursor pagination berbasis createdAt pesan.
  if (cursor) conditions.push(lt(messages.createdAt, new Date(cursor)));

  const rows = await db
    .select({
      messageId: messages.id,
      conversationId: conversations.id,
      conversationName: sql<string>`COALESCE(${peer.fullName}, ${peer.username})`,
      senderId: messages.senderId,
      senderName: sql<string>`COALESCE(${senderUser.fullName}, ${senderUser.username})`,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(mine, eq(mine.conversationId, messages.conversationId))
    .innerJoin(peerMember, eq(peerMember.conversationId, messages.conversationId))
    .innerJoin(peer, eq(peer.id, peerMember.userId))
    .innerJoin(senderUser, eq(senderUser.id, messages.senderId))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);
  return rows;
}

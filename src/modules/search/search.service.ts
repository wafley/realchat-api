/**
 * Layanan logika bisnis pencarian: user, grup, dan pesan. Menangani otorisasi
 * keanggotaan percakapan, paginasi berbasis cursor (fetch limit+1 untuk deteksi
 * halaman berikutnya), dan pembentukan struktur respons yang siap dikirim.
 */
import * as repository from './search.repository';
import { ForbiddenError } from '../../utils/errors';
import { findPresenceTargets } from '../users/users.repository';
import { filterVisiblePresenceIds } from '../users/presencePrivacy';

/**
 * Mencari user berdasarkan kata kunci, mengabaikan diri sendiri. Kehadiran
 * (isOnline/lastSeenAt) pada hasil disaring sesuai kebijakan privasi tiap
 * user yang ditemukan.
 */
export async function searchUsers(currentUserId: string, q: string, limit = 50) {
  const rows = await repository.searchUsers(currentUserId, q, limit);

  // Saring kehadiran hasil pencarian berdasarkan kebijakan privasi masing-masing.
  const targetMap = new Map(
    (await findPresenceTargets(rows.map((r) => r.id))).map((t) => [t.id, t]),
  );
  const visibleIds = await filterVisiblePresenceIds(currentUserId, targetMap);

  return rows.map((row) => {
    const presenceHidden = !visibleIds.has(row.id);
    return {
      ...row,
      isOnline: presenceHidden ? null : row.isOnline,
      lastSeenAt: presenceHidden ? null : row.lastSeenAt,
    };
  });
}

/**
 * Mencari grup yang diikuti user berdasarkan nama, dengan paginasi cursor
 * (createdAt menurun). Mengambil limit+1 baris untuk mendeteksi halaman
 * berikutnya; cursor berikutnya adalah createdAt item terakhir.
 */
export async function searchGroups(currentUserId: string, q: string, cursor?: string, limit = 50) {
  const rows = await repository.searchGroups(currentUserId, q, cursor, limit);
  // Baris ke-limit+1 hanya penanda hasMore; buang sebelum dikirim ke client.
  const hasMore = rows.length > limit;
  const groups = hasMore ? rows.slice(0, limit) : rows;

  return {
    groups: groups.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? groups[groups.length - 1].createdAt : null,
  };
}

/**
 * Mencari pesan berdasarkan kata kunci. Tanpa conversationId berarti mencari
 * di semua percakapan yang diikuti user (yang tidak disembunyikan); dengan
 * conversationId, user wajib menjadi anggota percakapan tersebut.
 * @throws ForbiddenError jika user bukan anggota percakapan yang diminta.
 */
export async function searchMessages(
  userId: string,
  options: {
    q: string;
    conversationId?: string;
    before?: Date;
    after?: Date;
    cursor?: string;
    limit?: number;
  },
) {
  const { conversationId, q, before, after, cursor, limit = 50 } = options;

  // Pencarian terbatas pada satu percakapan: pastikan user anggotanya dulu.
  if (conversationId) {
    const isMember = await repository.isConversationMember(conversationId, userId);
    if (!isMember) throw new ForbiddenError('You are not a member of this conversation');
  }

  const rows = await repository.searchMessages(userId, {
    conversationId,
    q,
    before,
    after,
    cursor,
    limit,
  });
  // Pola paginasi cursor yang sama: ambil limit+1, sisanya jadi nextCursor.
  const hasMore = rows.length > limit;
  const messages = hasMore ? rows.slice(0, limit) : rows;

  return {
    messages: messages.map(({ senderUsername, senderFullName, ...message }) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
      sender: {
        username: senderUsername,
        fullName: senderFullName,
      },
    })),
    nextCursor: hasMore ? messages[messages.length - 1].createdAt.toISOString() : null,
  };
}

/**
 * Mencari pesan di semua percakapan pribadi (DM) milik user, dengan paginasi
 * cursor berbasis createdAt. Nama lawan bicara difallback ke username bila
 * nama lengkap tidak tersedia.
 */
export async function searchDmMessages(userId: string, q: string, cursor?: string, limit = 50) {
  const rows = await repository.searchDmMessages(userId, q, cursor, limit);
  const hasMore = rows.length > limit;
  const messages = hasMore ? rows.slice(0, limit) : rows;

  return {
    messages: messages.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? messages[messages.length - 1].createdAt.toISOString() : null,
  };
}

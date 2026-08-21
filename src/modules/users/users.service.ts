/**
 * Logika bisnis pengguna: profil, avatar, ganti password, dan blokir.
 * Setiap perubahan profil memicu event socket 'user:updated' ke kontak
 * dan anggota grup terkait agar tampilan tetap sinkron secara realtime.
 */
import * as repository from './users.repository';
import * as blockedRepository from './blockedUsers.repository';
import { findUserById, findUserByUsername } from '../auth/auth.repository';
import { comparePassword, hashPassword } from '../../utils/hashPassword';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors';
import db from '../../db/index';
import { contacts } from '../../db/schema/contacts';
import { conversationMembers } from '../../db/schema/conversationMembers';
import { conversations } from '../../db/schema/conversations';
import { eq, and, or, ne, inArray } from 'drizzle-orm';
import { getIO } from '../../socket/index';
import { canSeePresence } from './presencePrivacy';
import { unlinkQuietly } from '../../utils/cleanup';
import { env } from '../../config/env';
import path from 'path';

/**
 * Menyebarkan event 'user:updated' ke semua pihak yang perlu tahu perubahan
 * profil: kontak dua arah dan sesama anggota grup pengguna.
 */
async function emitProfileUpdate(
  userId: string,
  updated: {
    id: string;
    username: string;
    fullName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
    statusText: string | null;
  },
) {
  const [contactRows, myGroupRows] = await Promise.all([
    db
      .select({ userId: contacts.userId, contactId: contacts.contactId })
      .from(contacts)
      .where(or(eq(contacts.userId, userId), eq(contacts.contactId, userId))),
    db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(and(eq(conversationMembers.userId, userId), eq(conversations.type, 'GROUP'))),
  ]);

  // Kumpulkan penerima unik: kontak dua arah + anggota grup milik pengguna.
  const recipients = new Set<string>();
  for (const row of contactRows) {
    recipients.add(row.userId === userId ? row.contactId : row.userId);
  }

  if (myGroupRows.length > 0) {
    const groupMemberRows = await db
      .select({ memberId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          inArray(
            conversationMembers.conversationId,
            myGroupRows.map((r) => r.conversationId),
          ),
          ne(conversationMembers.userId, userId),
        ),
      );
    for (const row of groupMemberRows) {
      recipients.add(row.memberId);
    }
  }

  recipients.delete(userId);

  const io = getIO();
  const payload = {
    userId: updated.id,
    username: updated.username,
    fullName: updated.fullName,
    avatarUrl: updated.avatarUrl,
    bannerUrl: updated.bannerUrl,
    bio: updated.bio,
    statusText: updated.statusText,
  };
  for (const id of recipients) {
    io.to(`user:${id}`).emit('user:updated', payload);
  }
}

/** Mengambil profil lengkap milik pengguna sendiri.
 * @throws NotFoundError jika pengguna tidak ditemukan
 */
export async function getProfile(userId: string) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    statusText: user.statusText,
    isOnline: user.isOnline,
    lastSeenAt: user.lastSeenAt,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
  };
}

/**
 * Mengambil pengaturan privasi milik pengguna yang sedang login.
 * @throws NotFoundError jika pengguna tidak ditemukan
 */
export async function getPrivacySettings(userId: string) {
  const settings = await repository.findPrivacySettings(userId);
  if (!settings) throw new NotFoundError('User not found');
  return settings;
}

/**
 * Memperbarui sebagian atau seluruh pengaturan privasi milik sendiri.
 * @throws NotFoundError jika pengguna tidak ditemukan
 */
export async function updatePrivacySettings(
  userId: string,
  data: { lastSeenVisibility?: string; groupInvitePolicy?: string },
) {
  const updated = await repository.updatePrivacySettings(userId, data);
  if (!updated) throw new NotFoundError('User not found');
  return updated;
}

/** Jeda minimum (hari) antar penggantian username untuk mencegah penyalahgunaan. */
const USERNAME_COOLDOWN_DAYS = 14;

/**
 * Memperbarui profil pengguna. Penggantian username diperiksa keunikan dan
 * dibatasi oleh cooldown 14 hari sejak pergantian terakhir.
 * @throws NotFoundError jika pengguna tidak ada
 * @throws ConflictError jika username baru sudah dipakai orang lain
 * @throws BadRequestError jika masih dalam masa cooldown username
 */
export async function updateProfile(
  userId: string,
  data: { username?: string; fullName?: string; bio?: string | null; statusText?: string },
) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  if (data.username && data.username !== user.username) {
    const existing = await findUserByUsername(data.username);
    if (existing) throw new ConflictError('Username already taken');

    if (user.usernameUpdatedAt) {
      const daysSinceLastChange =
        (Date.now() - new Date(user.usernameUpdatedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastChange < USERNAME_COOLDOWN_DAYS) {
        const remaining = Math.ceil(USERNAME_COOLDOWN_DAYS - daysSinceLastChange);
        throw new BadRequestError(`You can change your username again in ${remaining} day(s)`);
      }
    }
  }

  const updateData: Parameters<typeof repository.updateUser>[1] = { ...data };
  if (data.username && data.username !== user.username) {
    updateData.usernameUpdatedAt = new Date();
  }

  const updated = await repository.updateUser(userId, updateData);
  await emitProfileUpdate(userId, updated);
  return updated;
}

/**
 * Mengambil profil publik pengguna lain. Kehadiran (isOnline/lastSeenAt)
 * disembunyikan bila ada relasi blokir dua arah ATAU kebijakan privasi
 * target tidak mengizinkan viewer melihatnya.
 * @throws NotFoundError jika pengguna tidak ada atau sudah dihapus
 */
export async function getUserById(viewerId: string, targetId: string) {
  const user = await findUserById(targetId);
  // Guard deletedAt: akun yang sudah dihapus diperlakukan tidak ada.
  if (!user || user.deletedAt) throw new NotFoundError('User not found');

  let presenceHidden = false;
  if (viewerId !== targetId) {
    const blocked = await blockedRepository.hasBlockRelation(viewerId, targetId);
    presenceHidden = blocked || !(await canSeePresence(viewerId, user));
  }

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    statusText: user.statusText,
    isOnline: presenceHidden ? null : user.isOnline,
    lastSeenAt: presenceHidden ? null : user.lastSeenAt,
  };
}

/**
 * Mengganti avatar: simpan URL file baru lalu hapus file avatar lama dari
 * disk agar tidak menumpuk file yatim.
 * @throws NotFoundError jika pengguna tidak ditemukan
 */
export async function updateAvatar(userId: string, file: Express.Multer.File) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  const avatarUrl = `/uploads/${file.filename}`;
  const updated = await repository.updateAvatar(userId, avatarUrl);

  if (user.avatarUrl) {
    const filename = user.avatarUrl.split('/').pop();
    if (filename) {
      await unlinkQuietly(path.join(env.uploadDir, filename));
    }
  }

  await emitProfileUpdate(userId, updated);
  return updated;
}

/**
 * Mengganti banner profil: pola sama dengan avatar - simpan URL baru,
 * hapus berkas lama dari disk, lalu siarkan perubahan ke kontak/grup.
 * @throws NotFoundError jika pengguna tidak ditemukan
 */
export async function updateBanner(userId: string, file: Express.Multer.File) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  const bannerUrl = `/uploads/${file.filename}`;
  const updated = await repository.updateBanner(userId, bannerUrl);

  // Berkas banner lama dihapus setelah DB berhasil diperbarui.
  if (user.bannerUrl) {
    const filename = user.bannerUrl.split('/').pop();
    if (filename) {
      await unlinkQuietly(path.join(env.uploadDir, filename));
    }
  }

  await emitProfileUpdate(userId, updated);
  return updated;
}

/**
 * Mengganti password setelah verifikasi password lama. tokenVersion dinaikkan
 * secara atomik bersama penghapusan refresh token, lalu semua socket aktif
 * dipaksa terputus agar sesi lama benar-benar berakhir.
 * @throws NotFoundError jika pengguna tidak ditemukan
 * @throws BadRequestError jika password lama salah
 */
export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  const valid = await comparePassword(oldPassword, user.passwordHash);
  if (!valid) throw new BadRequestError('Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await repository.changePasswordAtomically(userId, passwordHash);
  getIO().in(`user:${userId}`).disconnectSockets(true);
}

/**
 * Memblokir pengguna lain.
 * @throws BadRequestError jika mencoba memblokir diri sendiri
 * @throws NotFoundError jika target tidak ditemukan
 * @throws ConflictError jika target sudah diblokir sebelumnya
 */
export async function blockUser(userId: string, targetId: string) {
  if (userId === targetId) throw new BadRequestError('Cannot block yourself');

  const target = await findUserById(targetId);
  if (!target) throw new NotFoundError('User not found');

  const existing = await blockedRepository.findBlock(userId, targetId);
  if (existing) throw new ConflictError('User is already blocked');

  await blockedRepository.insertBlock(userId, targetId);
}

/**
 * Membuka blokir pengguna.
 * @throws BadRequestError jika mencoba membuka blokir diri sendiri
 * @throws NotFoundError jika target memang tidak sedang diblokir
 */
export async function unblockUser(userId: string, targetId: string) {
  if (userId === targetId) throw new BadRequestError('Cannot unblock yourself');

  const existing = await blockedRepository.findBlock(userId, targetId);
  if (!existing) throw new NotFoundError('User is not blocked');

  await blockedRepository.deleteBlock(userId, targetId);
}

/** Mengembalikan daftar pengguna yang diblokir oleh pengguna tersebut. */
export async function getBlockedUsers(userId: string) {
  const rows = await blockedRepository.listBlocked(userId);
  // Blokir selalu menyembunyikan kehadiran, termasuk di daftar blokir.
  return rows.map(({ isOnline: _isOnline, lastSeenAt: _lastSeenAt, ...rest }) => ({
    ...rest,
    isOnline: null,
    lastSeenAt: null,
  }));
}

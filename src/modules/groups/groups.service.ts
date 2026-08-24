/**
 * Logika bisnis modul grup: pembuatan, pembaruan profil & avatar,
 * manajemen anggota dan peran, keluar grup dengan transfer kepemilikan,
 * serta pembubaran grup termasuk pembersihan berkas lampiran.
 */
import * as repository from './groups.repository';
import { findUserById } from '../auth/auth.repository';
import * as contactsRepository from '../contacts/contacts.repository';
import {
  findConversationById,
  findMembersByConversationId,
  createGroupAtomically,
  addMembersAtomically,
  removeMemberAtomically,
  changeRoleAtomically,
  leaveGroupAtomically,
  insertMessage,
  deleteConversation,
  findConversationAttachmentPaths,
  countMessageFileReferences,
} from '../conversations/conversations.repository';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';
import { getIO } from '../../socket/index';
import { forceLeaveConversationRoom } from '../../socket/room';
import { createAndEmitMany } from '../notifications/notifications.service';
import { findGroupInviteOptOuts } from '../users/users.repository';
import { MAX_GROUP_MEMBERS } from '../../config/constants';
import { env } from '../../config/env';
import { unlinkQuietly } from '../../utils/cleanup';
import { toSender } from '../../utils/sender';
import path from 'path';

// Nama tampilan dengan fallback: fullName -> username -> 'Unknown'.
function displayName(user: { fullName?: string | null; username?: string } | null | undefined) {
  return user?.fullName || user?.username || 'Unknown';
}

/**
 * Memvalidasi kebijakan groupInvitePolicy setiap calon anggota terhadap
 * aktor. NOBODY selalu menolak; CONTACTS menolak bila aktor tidak tersimpan
 * sebagai kontak milik calon anggota.
 * @throws BadRequestError menyebut username yang menolak ditambahkan
 */
async function assertInviteAllowed(
  actorId: string,
  candidates: Array<{ id: string; username: string; groupInvitePolicy: string }>,
) {
  const rejected: string[] = [];
  for (const candidate of candidates) {
    if (candidate.id === actorId) continue;
    if (candidate.groupInvitePolicy === 'NOBODY') {
      rejected.push(`@${candidate.username}`);
      continue;
    }
    if (candidate.groupInvitePolicy === 'CONTACTS') {
      const contact = await contactsRepository.findContact(candidate.id, actorId);
      if (!contact) rejected.push(`@${candidate.username}`);
    }
  }
  if (rejected.length > 0) {
    throw new BadRequestError(
      `${rejected.join(', ')} only allows their contacts to add them to groups`,
    );
  }
}

/**
 * Hapus berkas fisik lampiran percakapan dan avatar grup dari storage.
 * Referensi-aware: berkas hanya di-unlink bila tidak ada pesan lain
 * (mis. hasil forward) yang masih memakai fileUrl yang sama.
 */
async function cleanupConversationFiles(
  conversationId: string,
  avatarUrl: string | null | undefined,
) {
  const filePaths = await findConversationAttachmentPaths(conversationId);
  // Hitung referensi lintas percakapan sebelum menghapus tiap berkas.
  for (const url of filePaths) {
    if ((await countMessageFileReferences(url, conversationId)) === 0) {
      const filename = url.split('/').pop();
      if (filename) {
        await unlinkQuietly(path.join(env.uploadDir, filename));
      }
    }
  }
  if (avatarUrl) {
    const filename = avatarUrl.split('/').pop();
    if (filename) {
      await unlinkQuietly(path.join(env.uploadDir, filename));
    }
  }
}

/**
 * Simpan pesan SYSTEM ke DB lalu siarkan ke room percakapan.
 * @returns Payload pesan lengkap dengan data pengirim
 */
async function emitSystemMessage(
  conversationId: string,
  senderId: string,
  content: string,
  senderUser?: Awaited<ReturnType<typeof findUserById>> | null,
) {
  const message = await insertMessage({ conversationId, senderId, content, type: 'SYSTEM' });
  const sender = senderUser ?? (await findUserById(senderId));
  const payload = { ...message, sender: toSender(sender) };
  getIO().to(`conversation:${conversationId}`).emit('message:new', payload);
  return payload;
}

/**
 * Gerbang otorisasi admin: pastikan grup ada, bertipe GROUP, dan
 * pelaku merupakan anggota berperan ADMIN.
 * @returns Data percakapan beserta daftar anggotanya
 */
async function validateGroupAdmin(userId: string, groupId: string) {
  const [conversation, members] = await Promise.all([
    findConversationById(groupId),
    findMembersByConversationId(groupId),
  ]);
  if (!conversation) throw new NotFoundError('Group not found');
  if (conversation.type !== 'GROUP') throw new BadRequestError('Not a group conversation');

  const currentMember = members.find((m) => m.userId === userId);
  if (!currentMember) throw new ForbiddenError('You are not a member of this group');
  if (currentMember.role !== 'ADMIN')
    throw new ForbiddenError('Only admins can perform this action');

  return { conversation, members };
}

/**
 * Buat grup baru; pembuat otomatis menjadi ADMIN.
 * @throws BadRequestError jika kuota terlampaui / ada yang belum verifikasi
 * @throws NotFoundError jika ada participantId tidak dikenal
 */
export async function createGroup(
  userId: string,
  data: { name: string; description?: string; participantIds: string[] },
  avatarUrl?: string | null,
) {
  const allIds = [userId, ...data.participantIds];
  if (data.participantIds.includes(userId))
    throw new BadRequestError('You cannot add yourself as a participant');
  if (allIds.length > MAX_GROUP_MEMBERS)
    throw new BadRequestError(`Group cannot have more than ${MAX_GROUP_MEMBERS} members`);

  // Pastikan setiap calon anggota ada dan sudah terverifikasi.
  const candidateUsers: Awaited<ReturnType<typeof findUserById>>[] = [];
  for (const id of allIds) {
    const user = await findUserById(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    if (!user.isVerified) throw new BadRequestError('All group members must be verified');
    candidateUsers.push(user);
  }

  // Hormati kebijakan privasi calon anggota soal ditambahkan ke grup.
  await assertInviteAllowed(userId, candidateUsers);

  // Grup + anggota dibuat atomik agar tak ada grup tanpa anggota.
  const conversation = await createGroupAtomically(
    {
      type: 'GROUP',
      name: data.name,
      description: data.description ?? null,
      avatarUrl: avatarUrl ?? null,
      createdBy: userId,
    },
    allIds.map((id) => ({
      userId: id,
      role: id === userId ? 'ADMIN' : 'MEMBER',
    })),
  );

  const actor = await findUserById(userId);
  await emitSystemMessage(
    conversation.id,
    userId,
    `${displayName(actor)} created the group`,
    actor,
  );

  // Undangan grup untuk semua partisipan kecuali pembuat; penerima yang
  // mematikan notifikasi undangan tetap masuk grup tanpa notifikasi.
  const inviteOptOuts = await findGroupInviteOptOuts(allIds.filter((id) => id !== userId));
  await createAndEmitMany(
    allIds
      .filter((id) => id !== userId && !inviteOptOuts.has(id))
      .map((id) => ({
        userId: id,
        type: 'group_invite',
        actorId: userId,
        conversationId: conversation.id,
        title: 'Grup Baru',
        body: `@${actor?.username || 'Someone'} membuat grup "${conversation.name || ''}"`,
      })),
  );

  // Umumkan grup baru lalu gabungkan socket semua anggota ke room-nya.
  const io = getIO();
  allIds.forEach((id) => {
    io.to(`user:${id}`).emit('group:created', {
      conversationId: conversation.id,
      name: conversation.name,
    });
  });
  io.in(allIds.map((id) => `user:${id}`)).socketsJoin(`conversation:${conversation.id}`);

  return conversation;
}

/** Perbarui nama/deskripsi grup (khusus admin) dan siarkan perubahan. */
export async function updateGroup(
  userId: string,
  groupId: string,
  data: { name?: string; description?: string | null },
) {
  const { conversation, members } = await validateGroupAdmin(userId, groupId);
  const updated = await repository.updateGroup(groupId, data);
  members.forEach((m) => {
    getIO().to(`user:${m.userId}`).emit('group:updated', updated);
  });

  // Pesan sistem hanya bila nama benar-benar berubah.
  if (data.name && data.name !== conversation.name) {
    const actor = await findUserById(userId);
    await emitSystemMessage(
      conversation.id,
      userId,
      `${displayName(actor)} changed the group name to '${updated.name}'`,
      actor,
    );
  }

  return updated;
}

/** Ganti avatar grup (admin) dan hapus berkas avatar lama. */
export async function updateAvatar(userId: string, groupId: string, file: Express.Multer.File) {
  const { conversation, members } = await validateGroupAdmin(userId, groupId);
  const avatarUrl = `/uploads/${file.filename}`;
  const updated = await repository.updateGroupAvatar(groupId, avatarUrl);
  members.forEach((m) => {
    getIO().to(`user:${m.userId}`).emit('group:avatar-updated', updated);
  });
  // Avatar lama dihapus fisik setelah DB berhasil diperbarui.
  if (conversation.avatarUrl) {
    const filename = conversation.avatarUrl.split('/').pop();
    if (filename) {
      await unlinkQuietly(path.join(env.uploadDir, filename));
    }
  }
  return updated;
}

/**
 * Tambah banyak anggota baru (khusus admin): validasi pengguna dan
 * deduplikasi di sini, penambahan atomik + cek kuota di repository.
 * @returns Jumlah anggota yang benar-benar ditambahkan
 */
export async function addMembers(userId: string, groupId: string, userIds: string[]) {
  const { conversation, members } = await validateGroupAdmin(userId, groupId);

  // Deduplikasi input lalu buang yang sudah menjadi anggota.
  const uniqueUserIds = [...new Set(userIds)];
  const existingIds = new Set(members.map((m) => m.userId));
  const newIds = uniqueUserIds.filter((id) => !existingIds.has(id));

  if (newIds.length === 0) throw new BadRequestError('All users are already members');

  const newUsers: Awaited<ReturnType<typeof findUserById>>[] = [];
  for (const id of newIds) {
    const user = await findUserById(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    if (!user.isVerified) throw new BadRequestError('All group members must be verified');
    newUsers.push(user);
  }

  // Hormati kebijakan privasi calon anggota soal ditambahkan ke grup.
  await assertInviteAllowed(userId, newUsers);

  // Penambahan aktual di repository (advisory lock + cek kuota); hasil
  // bisa lebih sedikit bila ada penambahan paralel.
  const addedIds = await addMembersAtomically(groupId, newIds, MAX_GROUP_MEMBERS);
  const addedUsers = newUsers.filter((u) => addedIds.includes(u.id));

  const io = getIO();

  // Event berbeda untuk anggota baru vs anggota lama.
  addedIds.forEach((id) => {
    io.to(`user:${id}`).emit('group:member-added', {
      conversationId: groupId,
      addedBy: userId,
    });
  });

  members.forEach((m) => {
    io.to(`user:${m.userId}`).emit('group:member-added', {
      conversationId: groupId,
      newMembers: addedIds,
      addedBy: userId,
    });
  });

  const actor = await findUserById(userId);
  await emitSystemMessage(
    groupId,
    userId,
    `${displayName(actor)} added ${addedUsers.map((u) => displayName(u)).join(', ')}`,
    actor,
  );

  // Notifikasi "ditambahkan ke grup" dilewati bagi penerima yang
  // mematikan notifikasi undangan; keanggotaan tetap berlaku.
  const addOptOuts = await findGroupInviteOptOuts(addedIds);
  await createAndEmitMany(
    addedIds
      .filter((id) => !addOptOuts.has(id))
      .map((id) => ({
        userId: id,
        type: 'group_invite',
        actorId: userId,
        conversationId: groupId,
        title: 'Grup Baru',
        body: `@${actor?.username || 'Someone'} menambahkan Anda ke grup "${conversation.name || ''}"`,
      })),
  );

  // Masukkan socket anggota baru ke room grup.
  io.in(addedIds.map((id) => `user:${id}`)).socketsJoin(`conversation:${groupId}`);

  return { added: addedIds.length };
}

/**
 * Keluarkan satu anggota dari grup (khusus admin). Pembuat grup tidak
 * dapat dikeluarkan; admin hanya dapat dikeluarkan oleh pembuat.
 */
export async function removeMember(userId: string, groupId: string, targetUserId: string) {
  const { conversation, members } = await validateGroupAdmin(userId, groupId);

  if (targetUserId === userId) throw new BadRequestError('Use /leave to leave the group');
  if (conversation.createdBy === targetUserId)
    throw new ForbiddenError('Cannot remove the group creator');

  const targetMember = members.find((m) => m.userId === targetUserId);
  if (targetMember?.role === 'ADMIN' && conversation.createdBy !== userId)
    throw new ForbiddenError('Only the group creator can remove an admin');

  await removeMemberAtomically(groupId, targetUserId);

  const io = getIO();
  io.to(`user:${targetUserId}`).emit('group:member-removed', {
    conversationId: groupId,
    targetUserId,
    removedBy: userId,
  });
  members
    .filter((m) => m.userId !== targetUserId)
    .forEach((m) => {
      io.to(`user:${m.userId}`).emit('group:member-removed', {
        conversationId: groupId,
        targetUserId,
        removedBy: userId,
      });
    });

  const [actor, targetUser] = await Promise.all([findUserById(userId), findUserById(targetUserId)]);
  await emitSystemMessage(
    groupId,
    userId,
    `${displayName(actor)} removed ${displayName(targetUser)}`,
    actor,
  );

  // Paksa socket target keluar dari room grup.
  await forceLeaveConversationRoom(targetUserId, groupId);
}

/**
 * Ubah peran anggota (ADMIN/MEMBER) oleh admin. Peran pembuat tidak
 * dapat diubah; demosi admin hanya boleh dilakukan pembuat.
 */
export async function changeRole(
  userId: string,
  groupId: string,
  targetUserId: string,
  role: string,
) {
  const { conversation, members } = await validateGroupAdmin(userId, groupId);

  // Tidak boleh mengubah peran sendiri maupun peran pembuat grup.
  if (targetUserId === userId) throw new BadRequestError('You cannot change your own role');
  if (conversation.createdBy === targetUserId)
    throw new ForbiddenError('Cannot change the group creator role');

  const targetMember = members.find((m) => m.userId === targetUserId);
  if (targetMember?.role === 'ADMIN' && role === 'MEMBER' && conversation.createdBy !== userId)
    throw new ForbiddenError('Only the group creator can demote an admin');

  await changeRoleAtomically(groupId, targetUserId, role);

  const io = getIO();
  members.forEach((m) => {
    io.to(`user:${m.userId}`).emit('group:member-role-changed', {
      conversationId: groupId,
      targetUserId,
      newRole: role,
      changedBy: userId,
    });
  });

  const [actor, targetUser] = await Promise.all([findUserById(userId), findUserById(targetUserId)]);
  await emitSystemMessage(
    groupId,
    userId,
    role === 'ADMIN'
      ? `${displayName(actor)} made ${displayName(targetUser)} admin`
      : `${displayName(actor)} demoted ${displayName(targetUser)} to member`,
    actor,
  );
}

/**
 * Keluar dari grup. Bila pelaku pemilik/admin terakhir, transfer
 * kepemilikan atau promosi admin ditangani leaveGroupAtomically.
 * Grup yang tinggal kosong otomatis dibubarkan beserta berkasnya.
 */
export async function leaveGroup(userId: string, groupId: string) {
  const conversation = await findConversationById(groupId);
  if (!conversation) throw new NotFoundError('Group not found');
  if (conversation.type !== 'GROUP') throw new BadRequestError('Not a group conversation');

  const members = await findMembersByConversationId(groupId);
  if (!members.some((m) => m.userId === userId))
    throw new NotFoundError('You are not a member of this group');

  // Transaksi atomik: promosi/transfer + penghapusan keanggotaan.
  const { promotedUserId, transferredToId } = await leaveGroupAtomically(groupId, userId);

  // Member dipromosikan menjadi admin menggantikan yang keluar.
  if (promotedUserId) {
    const [leaverUser, newAdminUser] = await Promise.all([
      findUserById(userId),
      findUserById(promotedUserId),
    ]);
    getIO()
      .to(members.filter((m) => m.userId !== userId).map((m) => `user:${m.userId}`))
      .emit('group:member-role-changed', {
        conversationId: groupId,
        targetUserId: promotedUserId,
        newRole: 'ADMIN',
        changedBy: userId,
      });
    await emitSystemMessage(
      groupId,
      userId,
      `${displayName(leaverUser)} made ${displayName(newAdminUser)} admin`,
      leaverUser,
    );
  }

  // Kepemilikan grup berpindah ke admin/member terpilih.
  if (transferredToId) {
    const [leaverUser, newOwnerUser] = await Promise.all([
      findUserById(userId),
      findUserById(transferredToId),
    ]);
    getIO()
      .to(members.filter((m) => m.userId !== userId).map((m) => `user:${m.userId}`))
      .emit('group:ownership-transferred', {
        conversationId: groupId,
        newOwnerId: transferredToId,
        changedBy: userId,
      });
    await emitSystemMessage(
      groupId,
      userId,
      `${displayName(leaverUser)} transferred ownership to ${displayName(newOwnerUser)}`,
      leaverUser,
    );
  }

  const membersAfter = await findMembersByConversationId(groupId);
  const io = getIO();

  // Auto-dismiss: grup tanpa anggota dihapus bersama berkas lampiran
  // dan avatarnya (referensi-aware), lalu room socket dibubarkan.
  if (membersAfter.length === 0) {
    await cleanupConversationFiles(groupId, conversation.avatarUrl);
    await deleteConversation(groupId);
    io.to(`user:${userId}`).emit('group:dismissed', { conversationId: groupId });
    const room = `conversation:${groupId}`;
    io.in(room).socketsLeave(room);

    return;
  }

  // Masih ada anggota: umumkan kepergian lewat event + pesan sistem.
  io.to(`user:${userId}`).emit('group:member-removed', {
    conversationId: groupId,
    targetUserId: userId,
    removedBy: userId,
  });
  membersAfter.forEach((m) => {
    io.to(`user:${m.userId}`).emit('group:member-removed', {
      conversationId: groupId,
      targetUserId: userId,
      removedBy: userId,
    });
  });

  const leaver = await findUserById(userId);
  await emitSystemMessage(groupId, userId, `${displayName(leaver)} left the group`, leaver);

  await forceLeaveConversationRoom(userId, groupId);
}

/**
 * Bubarkan grup (hanya pembuat): berkas lampiran & avatar dibersihkan
 * secara referensi-aware sebelum data percakapan dihapus.
 */
export async function dismissGroup(userId: string, groupId: string) {
  const { conversation, members } = await validateGroupAdmin(userId, groupId);

  if (conversation.createdBy !== userId)
    throw new ForbiddenError('Only the group creator can dismiss the group');

  // Berkas dibersihkan sebelum baris DB hilang agar daftar fileUrl
  // masih dapat dihitung referensinya.
  await cleanupConversationFiles(groupId, conversation.avatarUrl);
  await deleteConversation(groupId);

  const io = getIO();
  members.forEach((m) => {
    io.to(`user:${m.userId}`).emit('group:dismissed', { conversationId: groupId });
  });
  const room = `conversation:${groupId}`;
  io.in(room).socketsLeave(room);
}

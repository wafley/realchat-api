import * as repository from './groups.repository';
import { findUserById } from '../auth/auth.repository';
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
} from '../conversations/conversations.repository';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';
import { getIO } from '../../socket/index';
import { createAndEmitMany } from '../notifications/notifications.service';
import { MAX_GROUP_MEMBERS } from '../../config/constants';
import { env } from '../../config/env';
import { unlinkQuietly } from '../../utils/cleanup';
import { toSender } from '../../utils/sender';
import path from 'path';

function displayName(user: { fullName?: string | null; username?: string } | null | undefined) {
  return user?.fullName || user?.username || 'Unknown';
}

async function emitSystemMessage(conversationId: string, senderId: string, content: string) {
  const message = await insertMessage({ conversationId, senderId, content, type: 'SYSTEM' });
  const payload = { ...message, sender: toSender(await findUserById(senderId)) };
  getIO().to(`conversation:${conversationId}`).emit('message:new', payload);
  return payload;
}

async function forceLeaveConversationRoom(userId: string, conversationId: string) {
  const sockets = await getIO().in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    socket.leave(`conversation:${conversationId}`);
  }
}

async function validateGroupAdmin(userId: string, groupId: string) {
  const conversation = await findConversationById(groupId);
  if (!conversation) throw new NotFoundError('Group not found');
  if (conversation.type !== 'GROUP') throw new BadRequestError('Not a group conversation');

  const members = await findMembersByConversationId(groupId);
  const currentMember = members.find((m) => m.userId === userId);
  if (!currentMember) throw new ForbiddenError('You are not a member of this group');
  if (currentMember.role !== 'ADMIN')
    throw new ForbiddenError('Only admins can perform this action');

  return { conversation, members };
}

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

  for (const id of allIds) {
    const user = await findUserById(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    if (!user.isVerified) throw new BadRequestError('All group members must be verified');
  }

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
  await emitSystemMessage(conversation.id, userId, `${displayName(actor)} created the group`);

  await createAndEmitMany(
    allIds
      .filter((id) => id !== userId)
      .map((id) => ({
        userId: id,
        type: 'group_invite',
        actorId: userId,
        conversationId: conversation.id,
        title: 'Grup Baru',
        body: `@${actor?.username || 'Someone'} membuat grup "${conversation.name || ''}"`,
      })),
  );

  const io = getIO();
  allIds.forEach((id) => {
    io.to(`user:${id}`).emit('group:created', {
      conversationId: conversation.id,
      name: conversation.name,
    });
  });

  return conversation;
}

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

  if (data.name && data.name !== conversation.name) {
    const actor = await findUserById(userId);
    await emitSystemMessage(
      conversation.id,
      userId,
      `${displayName(actor)} changed the group name to '${updated.name}'`,
    );
  }

  return updated;
}

export async function updateAvatar(userId: string, groupId: string, file: Express.Multer.File) {
  const { conversation, members } = await validateGroupAdmin(userId, groupId);
  const avatarUrl = `/uploads/${file.filename}`;
  const updated = await repository.updateGroupAvatar(groupId, avatarUrl);
  members.forEach((m) => {
    getIO().to(`user:${m.userId}`).emit('group:avatar-updated', updated);
  });
  if (conversation.avatarUrl) {
    const filename = conversation.avatarUrl.split('/').pop();
    if (filename) {
      await unlinkQuietly(path.join(env.uploadDir, filename));
    }
  }
  return updated;
}

export async function addMembers(userId: string, groupId: string, userIds: string[]) {
  const { conversation, members } = await validateGroupAdmin(userId, groupId);

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

  const addedIds = await addMembersAtomically(groupId, newIds, MAX_GROUP_MEMBERS);
  const addedUsers = newUsers.filter((u) => addedIds.includes(u.id));

  const io = getIO();

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
  );

  await createAndEmitMany(
    addedIds.map((id) => ({
      userId: id,
      type: 'group_invite',
      actorId: userId,
      conversationId: groupId,
      title: 'Grup Baru',
      body: `@${actor?.username || 'Someone'} menambahkan Anda ke grup "${conversation.name || ''}"`,
    })),
  );

  return { added: addedIds.length };
}

export async function removeMember(userId: string, groupId: string, targetUserId: string) {
  const { members } = await validateGroupAdmin(userId, groupId);

  if (targetUserId === userId) throw new BadRequestError('Use /leave to leave the group');

  await removeMemberAtomically(groupId, targetUserId);

  const io = getIO();
  io.to(`user:${targetUserId}`).emit('group:member-removed', {
    conversationId: groupId,
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

  const actor = await findUserById(userId);
  const targetUser = await findUserById(targetUserId);
  await emitSystemMessage(
    groupId,
    userId,
    `${displayName(actor)} removed ${displayName(targetUser)}`,
  );

  await forceLeaveConversationRoom(targetUserId, groupId);
}

export async function changeRole(
  userId: string,
  groupId: string,
  targetUserId: string,
  role: string,
) {
  const { members } = await validateGroupAdmin(userId, groupId);

  if (targetUserId === userId) throw new BadRequestError('You cannot change your own role');

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

  const actor = await findUserById(userId);
  const targetUser = await findUserById(targetUserId);
  await emitSystemMessage(
    groupId,
    userId,
    role === 'ADMIN'
      ? `${displayName(actor)} made ${displayName(targetUser)} admin`
      : `${displayName(actor)} demoted ${displayName(targetUser)} to member`,
  );
}

export async function leaveGroup(userId: string, groupId: string) {
  const conversation = await findConversationById(groupId);
  if (!conversation) throw new NotFoundError('Group not found');
  if (conversation.type !== 'GROUP') throw new BadRequestError('Not a group conversation');

  const members = await findMembersByConversationId(groupId);
  if (!members.some((m) => m.userId === userId))
    throw new NotFoundError('You are not a member of this group');

  const { promotedUserId } = await leaveGroupAtomically(groupId, userId);

  if (promotedUserId) {
    const leaverUser = await findUserById(userId);
    const newAdminUser = await findUserById(promotedUserId);
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
    );
  }

  const membersAfter = await findMembersByConversationId(groupId);
  const io = getIO();

  if (membersAfter.length === 0) {
    await deleteConversation(groupId);
    io.to(`user:${userId}`).emit('group:dismissed', { conversationId: groupId });
    const room = `conversation:${groupId}`;
    io.in(room).socketsLeave(room);

    if (conversation.avatarUrl) {
      const filename = conversation.avatarUrl.split('/').pop();
      if (filename) {
        await unlinkQuietly(path.join(env.uploadDir, filename));
      }
    }
    return;
  }

  io.to(`user:${userId}`).emit('group:member-removed', {
    conversationId: groupId,
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
  await emitSystemMessage(groupId, userId, `${displayName(leaver)} left the group`);

  await forceLeaveConversationRoom(userId, groupId);
}

export async function dismissGroup(userId: string, groupId: string) {
  const { conversation, members } = await validateGroupAdmin(userId, groupId);

  await deleteConversation(groupId);

  const io = getIO();
  members.forEach((m) => {
    io.to(`user:${m.userId}`).emit('group:dismissed', { conversationId: groupId });
  });
  const room = `conversation:${groupId}`;
  io.in(room).socketsLeave(room);

  if (conversation.avatarUrl) {
    const filename = conversation.avatarUrl.split('/').pop();
    if (filename) {
      await unlinkQuietly(path.join(env.uploadDir, filename));
    }
  }
}

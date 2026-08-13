import * as repository from './groups.repository';
import { findUserById } from '../auth/auth.repository';
import {
  findConversationById,
  findMembersByConversationId,
  addMembers as addConversationMembers,
  removeMember as removeConversationMember,
  insertMessage,
} from '../conversations/conversations.repository';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';
import { getIO } from '../../socket/index';

function displayName(user: { fullName?: string | null; username?: string } | null | undefined) {
  return user?.fullName || user?.username || 'Unknown';
}

async function emitSystemMessage(conversationId: string, senderId: string, content: string) {
  const message = await insertMessage({ conversationId, senderId, content, type: 'SYSTEM' });
  getIO().to(`conversation:${conversationId}`).emit('message:new', message);
  return message;
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
  const { members } = await validateGroupAdmin(userId, groupId);
  const avatarUrl = `/uploads/${file.filename}`;
  const updated = await repository.updateGroupAvatar(groupId, avatarUrl);
  members.forEach((m) => {
    getIO().to(`user:${m.userId}`).emit('group:avatar-updated', updated);
  });
  return updated;
}

export async function addMembers(userId: string, groupId: string, userIds: string[]) {
  const { members } = await validateGroupAdmin(userId, groupId);

  const existingIds = new Set(members.map((m) => m.userId));
  const newIds = userIds.filter((id) => !existingIds.has(id));

  if (newIds.length === 0) throw new BadRequestError('All users are already members');

  const newUsers: Awaited<ReturnType<typeof findUserById>>[] = [];
  for (const id of newIds) {
    const user = await findUserById(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    newUsers.push(user);
  }

  await addConversationMembers(
    groupId,
    newIds.map((id) => ({ userId: id, role: 'MEMBER' })),
  );

  const io = getIO();

  newIds.forEach((id) => {
    io.to(`user:${id}`).emit('group:member-added', {
      conversationId: groupId,
      addedBy: userId,
    });
  });

  members.forEach((m) => {
    io.to(`user:${m.userId}`).emit('group:member-added', {
      conversationId: groupId,
      newMembers: newIds,
      addedBy: userId,
    });
  });

  const actor = await findUserById(userId);
  await emitSystemMessage(
    groupId,
    userId,
    `${displayName(actor)} added ${newUsers.map((u) => displayName(u)).join(', ')}`,
  );

  return { added: newIds.length };
}

export async function removeMember(userId: string, groupId: string, targetUserId: string) {
  const { members } = await validateGroupAdmin(userId, groupId);

  if (targetUserId === userId) throw new BadRequestError('Use /leave to leave the group');

  const target = members.find((m) => m.userId === targetUserId);
  if (!target) throw new NotFoundError('User is not a member of this group');

  const adminCount = members.filter((m) => m.role === 'ADMIN').length;
  if (target.role === 'ADMIN' && adminCount <= 1) {
    throw new BadRequestError('Cannot remove the last admin');
  }

  await removeConversationMember(groupId, targetUserId);

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
}

export async function changeRole(
  userId: string,
  groupId: string,
  targetUserId: string,
  role: string,
) {
  const { members } = await validateGroupAdmin(userId, groupId);

  const target = members.find((m) => m.userId === targetUserId);
  if (!target) throw new NotFoundError('User is not a member of this group');

  if (targetUserId === userId) throw new BadRequestError('You cannot change your own role');

  if (role === 'MEMBER') {
    const adminCount = members.filter((m) => m.role === 'ADMIN').length;
    if (target.role === 'ADMIN' && adminCount <= 1) {
      throw new BadRequestError('Cannot demote the last admin');
    }
  }

  await repository.updateMemberRole(groupId, targetUserId, role);

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
  const currentMember = members.find((m) => m.userId === userId);
  if (!currentMember) throw new NotFoundError('You are not a member of this group');

  const adminMembers = members.filter((m) => m.role === 'ADMIN');

  if (currentMember.role === 'ADMIN' && adminMembers.length === 1) {
    const nonAdminMembers = members.filter((m) => m.role === 'MEMBER');
    if (nonAdminMembers.length > 0) {
      const newAdmin = nonAdminMembers[0];
      await repository.updateMemberRole(groupId, newAdmin.userId, 'ADMIN');
    }
  }

  await removeConversationMember(groupId, userId);

  const membersAfter = await findMembersByConversationId(groupId);
  const io = getIO();
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
}

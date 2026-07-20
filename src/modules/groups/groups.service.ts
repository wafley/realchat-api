import * as repository from './groups.repository';
import { findUserById } from '../auth/auth.repository';
import {
  findConversationById,
  findMembersByConversationId,
  addMembers as addConversationMembers,
  removeMember as removeConversationMember,
} from '../conversations/conversations.repository';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';

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
  await validateGroupAdmin(userId, groupId);
  const updated = await repository.updateGroup(groupId, data);
  return updated;
}

export async function updateAvatar(userId: string, groupId: string, file: Express.Multer.File) {
  await validateGroupAdmin(userId, groupId);
  const avatarUrl = `/uploads/${file.filename}`;
  const updated = await repository.updateGroupAvatar(groupId, avatarUrl);
  return updated;
}

export async function addMembers(userId: string, groupId: string, userIds: string[]) {
  const { members } = await validateGroupAdmin(userId, groupId);

  const existingIds = new Set(members.map((m) => m.userId));
  const newIds = userIds.filter((id) => !existingIds.has(id));

  if (newIds.length === 0) throw new BadRequestError('All users are already members');

  for (const id of newIds) {
    const user = await findUserById(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
  }

  await addConversationMembers(
    groupId,
    newIds.map((id) => ({ userId: id, role: 'MEMBER' })),
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
}

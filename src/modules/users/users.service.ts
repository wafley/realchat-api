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

async function emitProfileUpdate(
  userId: string,
  updated: {
    id: string;
    username: string;
    fullName: string | null;
    bio: string | null;
    avatarUrl: string | null;
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
    bio: updated.bio,
    statusText: updated.statusText,
  };
  for (const id of recipients) {
    io.to(`user:${id}`).emit('user:updated', payload);
  }
}

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
    statusText: user.statusText,
    isOnline: user.isOnline,
    lastSeenAt: user.lastSeenAt,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
  };
}

const USERNAME_COOLDOWN_DAYS = 14;

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

export async function getUserById(targetId: string) {
  const user = await findUserById(targetId);
  if (!user) throw new NotFoundError('User not found');

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    statusText: user.statusText,
    isOnline: user.isOnline,
    lastSeenAt: user.lastSeenAt,
  };
}

export async function updateAvatar(userId: string, file: Express.Multer.File) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  const avatarUrl = `/uploads/${file.filename}`;
  const updated = await repository.updateAvatar(userId, avatarUrl);
  await emitProfileUpdate(userId, updated);
  return updated;
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  const valid = await comparePassword(oldPassword, user.passwordHash);
  if (!valid) throw new BadRequestError('Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await repository.changePasswordAtomically(userId, passwordHash);
}

export async function blockUser(userId: string, targetId: string) {
  if (userId === targetId) throw new BadRequestError('Cannot block yourself');

  const target = await findUserById(targetId);
  if (!target) throw new NotFoundError('User not found');

  const existing = await blockedRepository.findBlock(userId, targetId);
  if (existing) throw new ConflictError('User is already blocked');

  await blockedRepository.insertBlock(userId, targetId);
}

export async function unblockUser(userId: string, targetId: string) {
  if (userId === targetId) throw new BadRequestError('Cannot unblock yourself');

  const existing = await blockedRepository.findBlock(userId, targetId);
  if (!existing) throw new NotFoundError('User is not blocked');

  await blockedRepository.deleteBlock(userId, targetId);
}

export async function getBlockedUsers(userId: string) {
  return blockedRepository.listBlocked(userId);
}

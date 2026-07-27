import * as repository from './users.repository';
import { findUserById, findUserByUsername, deleteUserRefreshTokens } from '../auth/auth.repository';
import { comparePassword, hashPassword } from '../../utils/hashPassword';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors';
import { getFollowingIds } from '../friends/friends.service';

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
      const daysSinceLastChange = (Date.now() - new Date(user.usernameUpdatedAt).getTime()) / (1000 * 60 * 60 * 24);
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

export async function searchUsers(userId: string, query: string) {
  const results = await repository.searchUsers(query, userId);
  const followingIds = await getFollowingIds(userId);
  const followingIdSet = new Set(followingIds);

  return results.map((user) => ({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    statusText: user.statusText,
    isOnline: user.isOnline,
    lastSeenAt: user.lastSeenAt,
    isFollowing: followingIdSet.has(user.id),
  }));
}

export async function updateAvatar(userId: string, file: Express.Multer.File) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  const avatarUrl = `/uploads/${file.filename}`;
  const updated = await repository.updateAvatar(userId, avatarUrl);
  return updated;
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  const valid = await comparePassword(oldPassword, user.passwordHash);
  if (!valid) throw new BadRequestError('Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await repository.changePassword(userId, passwordHash);
  await deleteUserRefreshTokens(userId);
}

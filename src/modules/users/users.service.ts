import * as repository from './users.repository';
import { findUserById, findUserByUsername } from '../auth/auth.repository';
import { NotFoundError, ConflictError } from '../../utils/errors';

export async function getProfile(userId: string) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    statusText: user.statusText,
    isOnline: user.isOnline,
    lastSeenAt: user.lastSeenAt,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
  };
}

export async function updateProfile(
  userId: string,
  data: { username?: string; bio?: string | null; statusText?: string },
) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  if (data.username && data.username !== user.username) {
    const existing = await findUserByUsername(data.username);
    if (existing) throw new ConflictError('Username already taken');
  }

  const updated = await repository.updateUser(userId, data);
  return updated;
}

export async function getUserById(targetId: string) {
  const user = await findUserById(targetId);
  if (!user) throw new NotFoundError('User not found');

  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
    statusText: user.statusText,
    isOnline: user.isOnline,
    lastSeenAt: user.lastSeenAt,
  };
}

export async function searchUsers(query: string) {
  return repository.searchUsers(query);
}

import * as repository from './friends.repository';
import { findUserById } from '../auth/auth.repository';
import { NotFoundError } from '../../utils/errors';
import { getIO } from '../../socket/index';
import { createAndEmit } from '../notifications/notifications.service';

export async function followUser(myId: string, targetUserId: string) {
  if (myId === targetUserId) return null;

  const target = await findUserById(targetUserId);
  if (!target) throw new NotFoundError('User not found');

  const follow = await repository.follow(myId, targetUserId);

  const me = await findUserById(myId);

  getIO()
    .to(`user:${targetUserId}`)
    .emit('follow:new', {
      follower: {
        id: myId,
        username: me?.username,
        fullName: me?.fullName,
        avatarUrl: me?.avatarUrl,
      },
    });

  await createAndEmit({
    userId: targetUserId,
    type: 'new_follower',
    actorId: myId,
    title: 'Pengikut Baru',
    body: `@${me?.username || 'Someone'} mulai mengikuti Anda`,
  });

  return follow;
}

export async function unfollowUser(myId: string, targetUserId: string) {
  if (myId === targetUserId) return;

  await repository.unfollow(myId, targetUserId);

  getIO().to(`user:${targetUserId}`).emit('follow:remove', { userId: myId });
}

async function attachUserDetails(
  rows: { followerId: string; followingId: string }[],
  type: 'follower' | 'following',
) {
  const userIds = rows.map((r) => (type === 'following' ? r.followingId : r.followerId));
  const result = [];
  for (const id of userIds) {
    const user = await findUserById(id);
    if (user) {
      result.push({
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        isOnline: user.isOnline,
        lastSeenAt: user.lastSeenAt,
      });
    }
  }
  return result;
}

export async function getMyFollowing(userId: string, sort?: string) {
  const rows = await repository.findFollowing(userId, sort);
  return attachUserDetails(rows, 'following');
}

export async function getMyFollowers(userId: string) {
  const rows = await repository.findFollowers(userId);
  return attachUserDetails(rows, 'follower');
}

export async function getUserFollowing(targetUserId: string) {
  const rows = await repository.findFollowing(targetUserId);
  return attachUserDetails(rows, 'following');
}

export async function getUserFollowers(targetUserId: string) {
  const rows = await repository.findFollowers(targetUserId);
  return attachUserDetails(rows, 'follower');
}

export async function getRelationship(myId: string, targetUserId: string) {
  if (myId === targetUserId) return null;

  const [iFollowThem, theyFollowMe] = await Promise.all([
    repository.findFollow(myId, targetUserId),
    repository.findFollow(targetUserId, myId),
  ]);

  if (iFollowThem && theyFollowMe) return 'mutual';
  if (iFollowThem) return 'following';
  if (theyFollowMe) return 'follows_you';
  return 'none';
}

export async function getFollowingIds(userId: string) {
  return repository.findFollowingIds(userId);
}

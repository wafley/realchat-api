import * as repository from './friends.repository';
import { findUserById } from '../auth/auth.repository';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { getIO } from '../../socket/index';
import { createAndEmit } from '../notifications/notifications.service';

export async function sendRequest(senderId: string, receiverId: string) {
  if (senderId === receiverId) throw new BadRequestError('Cannot send friend request to yourself');

  const receiver = await findUserById(receiverId);
  if (!receiver) throw new NotFoundError('User not found');
  if (!receiver.isVerified)
    throw new BadRequestError('Cannot send friend request to an unverified user');

  const existing = await repository.findPendingRequest(senderId, receiverId);
  if (existing) throw new BadRequestError('Friend request already sent');

  const friendship = await repository.findFriendship(senderId, receiverId);
  if (friendship) throw new BadRequestError('Already friends');

  const sender = await findUserById(senderId);
  const request = await repository.createRequest({ senderId, receiverId });

  getIO().to(`user:${receiverId}`).emit('friend:request-received', { request });

  await createAndEmit({
    userId: receiverId,
    type: 'friend_request_received',
    actorId: senderId,
    friendRequestId: request.id,
    title: 'Friend Request',
    body: `${sender?.username || 'Someone'} sent you a friend request.`,
  });

  return request;
}

export async function getIncomingRequests(userId: string) {
  return repository.findRequestsByReceiverId(userId);
}

export async function getSentRequests(userId: string) {
  return repository.findRequestsBySenderId(userId);
}

export async function cancelRequest(userId: string, targetUserId: string) {
  const request = await repository.findPendingRequest(userId, targetUserId);
  if (!request) throw new NotFoundError('Pending request not found');
  if (request.senderId !== userId)
    throw new BadRequestError('You can only cancel your own requests');

  await repository.deleteRequest(request.id);

  const receiverId = targetUserId;
  getIO().to(`user:${receiverId}`).emit('friend:request-cancelled', { requestId: request.id });
}

export async function getFriends(userId: string) {
  const friendIds = await repository.findFriendsByUserId(userId);
  const friends = [];
  for (const { friendId } of friendIds) {
    const user = await findUserById(friendId);
    if (user) {
      friends.push({
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        statusText: user.statusText,
        isOnline: user.isOnline,
        lastSeenAt: user.lastSeenAt,
      });
    }
  }
  return friends;
}

export async function acceptRequest(userId: string, requestId: string) {
  const request = await repository.findRequestById(requestId);
  if (!request) throw new NotFoundError('Request not found');
  if (request.receiverId !== userId)
    throw new BadRequestError('You can only accept requests sent to you');
  if (request.status !== 'PENDING') throw new BadRequestError('Request is no longer pending');

  const accepter = await findUserById(userId);
  const updated = await repository.updateRequestStatus(requestId, 'ACCEPTED');

  getIO().to(`user:${request.senderId}`).emit('friend:request-accepted', { request: updated });

  await createAndEmit({
    userId: request.senderId,
    type: 'friend_request_accepted',
    actorId: userId,
    friendRequestId: request.id,
    title: 'Friend Request Accepted',
    body: `${accepter?.username || 'Someone'} accepted your friend request.`,
  });

  return updated;
}

export async function rejectRequest(userId: string, requestId: string) {
  const request = await repository.findRequestById(requestId);
  if (!request) throw new NotFoundError('Request not found');
  if (request.receiverId !== userId)
    throw new BadRequestError('You can only reject requests sent to you');
  if (request.status !== 'PENDING') throw new BadRequestError('Request is no longer pending');

  const updated = await repository.updateRequestStatus(requestId, 'REJECTED');

  getIO().to(`user:${request.senderId}`).emit('friend:request-rejected', { request: updated });
  return updated;
}

export async function unfriend(userId: string, targetUserId: string) {
  const friendship = await repository.findFriendship(userId, targetUserId);
  if (!friendship) throw new NotFoundError('Friendship not found');

  await repository.deleteRequestByUsers(userId, targetUserId);

  getIO().to(`user:${targetUserId}`).emit('friend:unfriended', { unfriendedBy: userId });
}

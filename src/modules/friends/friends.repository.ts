import db from '../../db/index';
import { friendRequests } from '../../db/schema/friendRequests';
import { eq, and, or } from 'drizzle-orm';

export const requestColumns = {
  id: friendRequests.id,
  senderId: friendRequests.senderId,
  receiverId: friendRequests.receiverId,
  status: friendRequests.status,
  createdAt: friendRequests.createdAt,
};

export async function createRequest(data: { senderId: string; receiverId: string }) {
  const [request] = await db
    .insert(friendRequests)
    .values({ ...data, status: 'PENDING' })
    .returning(requestColumns);
  return request;
}

export async function findRequestById(id: string) {
  const [request] = await db
    .select(requestColumns)
    .from(friendRequests)
    .where(eq(friendRequests.id, id))
    .limit(1);
  return request || null;
}

export async function findPendingRequest(userId1: string, userId2: string) {
  const [request] = await db
    .select(requestColumns)
    .from(friendRequests)
    .where(
      and(
        or(
          and(eq(friendRequests.senderId, userId1), eq(friendRequests.receiverId, userId2)),
          and(eq(friendRequests.senderId, userId2), eq(friendRequests.receiverId, userId1)),
        ),
        eq(friendRequests.status, 'PENDING'),
      ),
    )
    .limit(1);
  return request || null;
}

export async function findFriendship(userId1: string, userId2: string) {
  const [request] = await db
    .select(requestColumns)
    .from(friendRequests)
    .where(
      and(
        or(
          and(eq(friendRequests.senderId, userId1), eq(friendRequests.receiverId, userId2)),
          and(eq(friendRequests.senderId, userId2), eq(friendRequests.receiverId, userId1)),
        ),
        eq(friendRequests.status, 'ACCEPTED'),
      ),
    )
    .limit(1);
  return request || null;
}

export async function findRequestsByReceiverId(receiverId: string) {
  return db
    .select(requestColumns)
    .from(friendRequests)
    .where(and(eq(friendRequests.receiverId, receiverId), eq(friendRequests.status, 'PENDING')))
    .orderBy(friendRequests.createdAt);
}

export async function findRequestsBySenderId(senderId: string) {
  return db
    .select(requestColumns)
    .from(friendRequests)
    .where(and(eq(friendRequests.senderId, senderId), eq(friendRequests.status, 'PENDING')))
    .orderBy(friendRequests.createdAt);
}

export async function findFriendsByUserId(userId: string) {
  const sent = db
    .select({ friendId: friendRequests.receiverId })
    .from(friendRequests)
    .where(and(eq(friendRequests.senderId, userId), eq(friendRequests.status, 'ACCEPTED')))
    .as('sent');

  const received = db
    .select({ friendId: friendRequests.senderId })
    .from(friendRequests)
    .where(and(eq(friendRequests.receiverId, userId), eq(friendRequests.status, 'ACCEPTED')))
    .as('received');

  const [sentResult, receivedResult] = await Promise.all([
    db.select({ friendId: sent.friendId }).from(sent),
    db.select({ friendId: received.friendId }).from(received),
  ]);

  return [...sentResult, ...receivedResult];
}

export async function updateRequestStatus(id: string, status: string) {
  const [request] = await db
    .update(friendRequests)
    .set({ status })
    .where(eq(friendRequests.id, id))
    .returning(requestColumns);
  return request || null;
}

export async function deleteRequest(id: string) {
  await db.delete(friendRequests).where(eq(friendRequests.id, id));
}

export async function deleteRequestByUsers(userId1: string, userId2: string) {
  await db
    .delete(friendRequests)
    .where(
      or(
        and(eq(friendRequests.senderId, userId1), eq(friendRequests.receiverId, userId2)),
        and(eq(friendRequests.senderId, userId2), eq(friendRequests.receiverId, userId1)),
      ),
    );
}

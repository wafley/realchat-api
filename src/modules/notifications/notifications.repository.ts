import db from '../../db/index';
import { notifications } from '../../db/schema/notifications';
import { and, desc, eq, sql } from 'drizzle-orm';

const notificationColumns = {
  id: notifications.id,
  userId: notifications.userId,
  type: notifications.type,
  actorId: notifications.actorId,
  conversationId: notifications.conversationId,
  messageId: notifications.messageId,
  title: notifications.title,
  body: notifications.body,
  isRead: notifications.isRead,
  createdAt: notifications.createdAt,
};

export type CreateNotificationData = {
  userId: string;
  type: string;
  actorId?: string;
  conversationId?: string;
  messageId?: string;
  title: string;
  body: string;
};

export async function createMany(data: CreateNotificationData[]) {
  if (data.length === 0) return [];
  return db.insert(notifications).values(data).returning(notificationColumns);
}

export async function create(data: CreateNotificationData) {
  const [notif] = await createMany([data]);
  return notif;
}

export async function findById(id: string) {
  const [notif] = await db
    .select(notificationColumns)
    .from(notifications)
    .where(eq(notifications.id, id));
  return notif || null;
}

export async function findByUserId(userId: string, limit = 20, offset = 0) {
  return db
    .select(notificationColumns)
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function findUnreadCount(userId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(result.count);
}

export async function markAsRead(id: string, userId: string) {
  const [notif] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning(notificationColumns);
  return notif || null;
}

export async function markAllAsRead(userId: string) {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
}

export async function deleteById(id: string, userId: string) {
  const [deleted] = await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return deleted || null;
}

export async function deleteAll(userId: string) {
  const deleted = await db
    .delete(notifications)
    .where(eq(notifications.userId, userId))
    .returning({ id: notifications.id });
  return deleted.length;
}

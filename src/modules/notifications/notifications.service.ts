import * as repository from './notifications.repository';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { getIO } from '../../socket/index';

export async function createAndEmit(data: {
  userId: string;
  type: string;
  actorId?: string;
  conversationId?: string;
  messageId?: string;
  title: string;
  body: string;
}) {
  const notif = await repository.create(data);
  getIO().to(`user:${data.userId}`).emit('notification:new', { notification: notif });
  return notif;
}

export async function getNotifications(userId: string, limit: number, offset: number) {
  const items = await repository.findByUserId(userId, limit, offset);
  const totalUnread = await repository.findUnreadCount(userId);
  return { items, totalUnread };
}

export async function getUnreadCount(userId: string) {
  const count = await repository.findUnreadCount(userId);
  return { count };
}

export async function markAsRead(userId: string, notificationId: string) {
  const notif = await repository.findById(notificationId);
  if (!notif) throw new NotFoundError('Notification not found');
  if (notif.userId !== userId) throw new ForbiddenError('You cannot access this notification');

  return repository.markAsRead(notificationId, userId);
}

export async function markAllAsRead(userId: string) {
  await repository.markAllAsRead(userId);
}

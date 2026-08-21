/**
 * Handler HTTP untuk endpoint notifikasi: memvalidasi input dengan Zod,
 * memanggil service terkait, lalu merespons JSON; error diteruskan ke
 * middleware penanganan error lewat next().
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as notificationService from './notifications.service';
import { paginationSchema, notificationIdParamSchema } from './notifications.validator';

/** GET /notifications — daftar notifikasi user beserta jumlah belum dibaca. */
export async function getNotifications(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { limit, offset } = paginationSchema.parse(req.query);
    const result = await notificationService.getNotifications(req.userId!, limit, offset);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** GET /notifications/unread-count — jumlah notifikasi yang belum dibaca. */
export async function getUnreadCount(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await notificationService.getUnreadCount(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** PUT /notifications/:id/read — tandai satu notifikasi sebagai dibaca. */
export async function markAsRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = notificationIdParamSchema.parse(req.params);
    await notificationService.markAsRead(req.userId!, id);
    res.status(200).json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
}

/** PUT /notifications/read-all — tandai semua notifikasi sebagai dibaca. */
export async function markAllAsRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await notificationService.markAllAsRead(req.userId!);
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
}

/** DELETE /notifications/:id — hapus satu notifikasi milik user. */
export async function deleteNotification(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = notificationIdParamSchema.parse(req.params);
    await notificationService.deleteNotification(req.userId!, id);
    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
}

/** DELETE /notifications — hapus semua notifikasi milik user. */
export async function deleteAllNotifications(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await notificationService.deleteAllNotifications(req.userId!);
    res.status(200).json({ success: true, message: 'All notifications deleted', data: result });
  } catch (error) {
    next(error);
  }
}

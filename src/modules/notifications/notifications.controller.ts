import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as notificationService from './notifications.service';
import { paginationSchema, notificationIdParamSchema } from './notifications.validator';

export async function getNotifications(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { limit, offset } = paginationSchema.parse(req.query);
    const result = await notificationService.getNotifications(req.userId!, limit, offset);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getUnreadCount(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await notificationService.getUnreadCount(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function markAsRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = notificationIdParamSchema.parse(req.params);
    await notificationService.markAsRead(req.userId!, id);
    res.status(200).json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
}

export async function markAllAsRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await notificationService.markAllAsRead(req.userId!);
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
}

export async function deleteNotification(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = notificationIdParamSchema.parse(req.params);
    await notificationService.deleteNotification(req.userId!, id);
    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
}

export async function deleteAllNotifications(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await notificationService.deleteAllNotifications(req.userId!);
    res.status(200).json({ success: true, message: 'All notifications deleted', data: result });
  } catch (error) {
    next(error);
  }
}

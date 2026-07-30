import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import * as controller from './notifications.controller';

const router = Router();

router.get('/', verifyJWT, controller.getNotifications);
router.get('/unread-count', verifyJWT, controller.getUnreadCount);
router.put('/read-all', verifyJWT, controller.markAllAsRead);
router.put('/:id/read', verifyJWT, controller.markAsRead);

export default router;

import { Router } from 'express';
import authRoutes from '../modules/auth/auth.route';
import userRoutes from '../modules/users/users.route';
import conversationRoutes from '../modules/conversations/conversations.route';
import groupRoutes from '../modules/groups/groups.route';
import contactRoutes from '../modules/contacts/contacts.route';
import notificationRoutes from '../modules/notifications/notifications.route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/conversations', conversationRoutes);
router.use('/groups', groupRoutes);
router.use('/contacts', contactRoutes);
router.use('/notifications', notificationRoutes);

export default router;

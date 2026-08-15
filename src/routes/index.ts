import { Router } from 'express';
import authRoutes from '../modules/auth/auth.route';
import userRoutes from '../modules/users/users.route';
import conversationRoutes, { starredRouter } from '../modules/conversations/conversations.route';
import groupRoutes from '../modules/groups/groups.route';
import contactRoutes from '../modules/contacts/contacts.route';
import notificationRoutes from '../modules/notifications/notifications.route';
import deviceRoutes from '../modules/devices/devices.route';
import searchRoutes, { dmSearchRouter } from '../modules/search/search.route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/conversations', conversationRoutes);
router.use('/messages', starredRouter);
router.use('/groups', groupRoutes);
router.use('/contacts', contactRoutes);
router.use('/notifications', notificationRoutes);
router.use('/devices', deviceRoutes);
router.use('/search', searchRoutes);
router.use('/dm', dmSearchRouter);

export default router;

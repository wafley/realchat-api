import { Router } from 'express';
import authRoutes from '../modules/auth/auth.route';
import userRoutes from '../modules/users/users.route';
import conversationRoutes from '../modules/conversations/conversations.route';
import groupRoutes from '../modules/groups/groups.route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/conversations', conversationRoutes);
router.use('/groups', groupRoutes);

export default router;

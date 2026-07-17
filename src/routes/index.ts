import { Router } from 'express';
import authRoutes from '../modules/auth/auth.route';
import userRoutes from '../modules/users/users.route';
import conversationRoutes from '../modules/conversations/conversations.route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/conversations', conversationRoutes);

export default router;

import { Router } from 'express';
import authRoutes from '../modules/auth/auth.route';

const router = Router();

router.use('/auth', authRoutes);

export default router;

import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import { authRateLimiter, refreshRateLimiter } from '../../middlewares/rateLimiter';
import * as validator from './auth.validator';
import * as controller from './auth.controller';

const router = Router();

router.post('/register', authRateLimiter, validate(validator.registerSchema), controller.register);
router.post('/login', authRateLimiter, validate(validator.loginSchema), controller.login);
router.post('/refresh', refreshRateLimiter, validate(validator.refreshSchema), controller.refresh);
router.post('/logout', refreshRateLimiter, validate(validator.refreshSchema), controller.logout);
router.post(
  '/forgot-password',
  authRateLimiter,
  validate(validator.forgotPasswordSchema),
  controller.forgotPassword,
);
router.post(
  '/reset-password',
  authRateLimiter,
  validate(validator.resetPasswordSchema),
  controller.resetPassword,
);
router.post(
  '/verify-email',
  authRateLimiter,
  validate(validator.verifyEmailSchema),
  controller.verifyEmail,
);
router.delete('/me', verifyJWT, validate(validator.deleteAccountSchema), controller.deleteAccount);

export default router;

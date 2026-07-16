import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { rateLimiter } from '../../middlewares/rateLimiter';
import * as validator from './auth.validator';
import * as controller from './auth.controller';

const router = Router();

router.post('/register', rateLimiter, validate(validator.registerSchema), controller.register);
router.post('/login', rateLimiter, validate(validator.loginSchema), controller.login);
router.post('/refresh', validate(validator.refreshSchema), controller.refresh);
router.post('/logout', validate(validator.refreshSchema), controller.logout);
router.post('/forgot-password', rateLimiter, validate(validator.forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password', rateLimiter, validate(validator.resetPasswordSchema), controller.resetPassword);
router.post('/verify-email', rateLimiter, validate(validator.verifyEmailSchema), controller.verifyEmail);

export default router;

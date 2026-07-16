import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import * as validator from './auth.validator';
import * as controller from './auth.controller';

const router = Router();

router.post('/register', validate(validator.registerSchema), controller.register);
router.post('/login', validate(validator.loginSchema), controller.login);
router.post('/refresh', validate(validator.refreshSchema), controller.refresh);
router.post('/logout', validate(validator.refreshSchema), controller.logout);
router.post(
  '/forgot-password',
  validate(validator.forgotPasswordSchema),
  controller.forgotPassword,
);
router.post('/reset-password', validate(validator.resetPasswordSchema), controller.resetPassword);
router.post('/verify-email', validate(validator.verifyEmailSchema), controller.verifyEmail);

export default router;

import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import { upload } from '../../middlewares/upload';
import * as validator from './users.validator';
import * as controller from './users.controller';

const router = Router();

router.get('/me', verifyJWT, controller.getMe);
router.put('/me', verifyJWT, validate(validator.updateProfileSchema), controller.updateMe);
router.put('/me/avatar', verifyJWT, upload.single('avatar'), controller.uploadAvatar);
router.put(
  '/me/password',
  verifyJWT,
  validate(validator.changePasswordSchema),
  controller.changePassword,
);
router.get('/search', verifyJWT, controller.searchUsers);
router.get('/:id', verifyJWT, controller.getUserById);

export default router;

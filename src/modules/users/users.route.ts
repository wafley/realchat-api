import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import { uploadAvatar } from '../../middlewares/upload';
import { validateAndRenameImage } from '../../middlewares/imageValidation';
import * as validator from './users.validator';
import * as controller from './users.controller';
import { getRelationship } from '../contacts/contacts.controller';
import { userIdParamSchema } from '../contacts/contacts.validator';

const router = Router();

router.get('/me', verifyJWT, controller.getMe);
router.put('/me', verifyJWT, validate(validator.updateProfileSchema), controller.updateMe);
router.put(
  '/me/avatar',
  verifyJWT,
  uploadAvatar.single('avatar'),
  validateAndRenameImage,
  controller.uploadAvatar,
);
router.put(
  '/me/password',
  verifyJWT,
  validate(validator.changePasswordSchema),
  controller.changePassword,
);
router.get('/me/blocked', verifyJWT, controller.getBlockedUsers);
router.post(
  '/:id/block',
  verifyJWT,
  validate(validator.userIdSchema, 'params'),
  controller.blockUser,
);
router.delete(
  '/:id/block',
  verifyJWT,
  validate(validator.userIdSchema, 'params'),
  controller.unblockUser,
);
router.get(
  '/:userId/relationship',
  verifyJWT,
  validate(userIdParamSchema, 'params'),
  getRelationship,
);
router.get('/:id', verifyJWT, controller.getUserById);

export default router;

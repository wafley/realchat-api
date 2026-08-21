/**
 * Rute profil dan relasi pengguna: lihat/ubah profil sendiri, unggah avatar,
 * ganti password, serta blokir/buka blokir pengguna lain. Semua rute
 * dilindungi middleware verifyJWT.
 */
import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import { uploadAvatar, uploadBanner } from '../../middlewares/upload';
import { validateAndRenameImage } from '../../middlewares/imageValidation';
import * as validator from './users.validator';
import * as controller from './users.controller';
import { getRelationship } from '../contacts/contacts.controller';
import { userIdParamSchema } from '../contacts/contacts.validator';

/** Instance router Express untuk endpoint pengguna (dipasang di /api/users). */
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
  '/me/banner',
  verifyJWT,
  uploadBanner.single('banner'),
  validateAndRenameImage,
  controller.uploadBanner,
);
router.put(
  '/me/password',
  verifyJWT,
  validate(validator.changePasswordSchema),
  controller.changePassword,
);
router.get('/me/blocked', verifyJWT, controller.getBlockedUsers);
router.get('/me/privacy', verifyJWT, controller.getPrivacy);
router.put(
  '/me/privacy',
  verifyJWT,
  validate(validator.updatePrivacySchema),
  controller.updatePrivacy,
);
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

/** Router pengguna yang diekspor untuk didaftarkan di aplikasi utama. */
export default router;

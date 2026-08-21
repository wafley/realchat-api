/**
 * Rute HTTP modul grup: pembuatan & pembaruan profil/avatar, manajemen
 * anggota dan peran, keluar grup, serta pembubaran grup.
 * Seluruh rute mewajibkan JWT; rute avatar memakai pipeline Multer.
 */
import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import { uploadGroupPhoto } from '../../middlewares/upload';
import { validateAndRenameImage } from '../../middlewares/imageValidation';
import * as validator from './groups.validator';
import * as controller from './groups.controller';

// Router grup dipasang pada prefix /groups.
const router = Router();

// Unggahan avatar divalidasi gambarnya dan dinamai ulang sebelum
// body multipart divalidasi skema.
router.post(
  '/',
  verifyJWT,
  uploadGroupPhoto.single('avatar'),
  validateAndRenameImage,
  validate(validator.createGroupSchema),
  controller.createGroup,
);
router.put('/:id', verifyJWT, validate(validator.updateGroupSchema), controller.updateGroup);
router.put(
  '/:id/avatar',
  verifyJWT,
  uploadGroupPhoto.single('avatar'),
  validateAndRenameImage,
  controller.updateAvatar,
);
router.post('/:id/members', verifyJWT, validate(validator.addMembersSchema), controller.addMembers);
router.delete('/:id/members/:userId', verifyJWT, controller.removeMember);
router.put(
  '/:id/members/:userId/role',
  verifyJWT,
  validate(validator.roleSchema),
  controller.changeRole,
);
// DELETE /:id/leave = keluar sebagai anggota; DELETE /:id = bubarkan grup.
router.delete('/:id/leave', verifyJWT, controller.leaveGroup);
router.delete('/:id', verifyJWT, controller.dismissGroup);

export default router;

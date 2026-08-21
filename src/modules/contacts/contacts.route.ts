/**
 * Rute modul kontak: tambah kontak per username/massal, hapus, ubah nama
 * kustom, daftar kontak, dan cek status/relasi. Semua rute dilindungi
 * verifyJWT dan tervalidasi lewat middleware validate().
 */
import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import * as validator from './contacts.validator';
import * as controller from './contacts.controller';

/** Instance router Express untuk endpoint kontak (dipasang di /api/contacts). */
const router = Router();

router.post(
  '/by-username',
  verifyJWT,
  validate(validator.addContactByUsernameSchema),
  controller.addContactByUsername,
);
router.post('/bulk', verifyJWT, validate(validator.bulkContactsSchema), controller.addContactsBulk);
router.delete(
  '/:userId',
  verifyJWT,
  validate(validator.userIdParamSchema, 'params'),
  controller.removeContact,
);
router.patch(
  '/:userId',
  verifyJWT,
  validate(validator.userIdParamSchema, 'params'),
  validate(validator.updateCustomNameSchema),
  controller.updateCustomName,
);
router.get('/', verifyJWT, controller.getMyContacts);
router.get(
  '/:userId',
  verifyJWT,
  validate(validator.userIdParamSchema, 'params'),
  controller.checkContact,
);

/** Router kontak yang diekspor untuk didaftarkan di aplikasi utama. */
export default router;

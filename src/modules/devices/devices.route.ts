/**
 * Definisi rute perangkat (dipasang di bawah prefix /devices): registrasi dan
 * penghapusan token FCM. Keduanya butuh login (verifyJWT) dan validasi body.
 */
import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import * as validator from './devices.validator';
import * as controller from './devices.controller';

const router = Router();

router.post('/', verifyJWT, validate(validator.registerDeviceSchema), controller.registerDevice);
router.delete(
  '/',
  verifyJWT,
  validate(validator.unregisterDeviceSchema),
  controller.unregisterDevice,
);

/** Router Express berisi endpoint registrasi dan penghapusan perangkat. */
export default router;

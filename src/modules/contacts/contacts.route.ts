import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import * as validator from './contacts.validator';
import * as controller from './contacts.controller';

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
router.get('/', verifyJWT, controller.getMyContacts);
router.get(
  '/:userId',
  verifyJWT,
  validate(validator.userIdParamSchema, 'params'),
  controller.checkContact,
);

export default router;

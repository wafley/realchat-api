import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import * as validator from './users.validator';
import * as controller from './users.controller';

const router = Router();

router.get('/me', verifyJWT, controller.getMe);
router.put('/me', verifyJWT, validate(validator.updateProfileSchema), controller.updateMe);
router.get('/search', verifyJWT, controller.searchUsers);
router.get('/:id', verifyJWT, controller.getUserById);

export default router;

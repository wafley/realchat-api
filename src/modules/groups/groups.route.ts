import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import { upload } from '../../middlewares/upload';
import * as validator from './groups.validator';
import * as controller from './groups.controller';

const router = Router();

router.put('/:id', verifyJWT, validate(validator.updateGroupSchema), controller.updateGroup);
router.put('/:id/avatar', verifyJWT, upload.single('avatar'), controller.updateAvatar);
router.post('/:id/members', verifyJWT, validate(validator.addMembersSchema), controller.addMembers);
router.delete('/:id/members/:userId', verifyJWT, controller.removeMember);
router.put(
  '/:id/members/:userId/role',
  verifyJWT,
  validate(validator.roleSchema),
  controller.changeRole,
);
router.delete('/:id/leave', verifyJWT, controller.leaveGroup);

export default router;

import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import * as validator from './conversations.validator';
import * as controller from './conversations.controller';

const router = Router();

router.post(
  '/',
  verifyJWT,
  validate(validator.createConversationSchema),
  controller.createConversation,
);
router.get('/', verifyJWT, controller.getConversations);
router.get('/:id', verifyJWT, controller.getConversationById);
router.delete('/:id', verifyJWT, controller.leaveConversation);

export default router;

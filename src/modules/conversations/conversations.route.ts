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
router.get('/:id/messages', verifyJWT, controller.getMessages);
router.get('/:id/pinned', verifyJWT, controller.getPinnedMessages);
router.put(
  '/:id/messages/:messageId',
  verifyJWT,
  validate(validator.editMessageSchema),
  controller.editMessage,
);
router.delete('/:id/messages/:messageId', verifyJWT, controller.deleteMessage);
router.put('/:id/messages/:messageId/pin', verifyJWT, controller.pinMessage);
router.delete('/:id/messages/:messageId/pin', verifyJWT, controller.unpinMessage);
router.post(
  '/:id/messages/:messageId/forward',
  verifyJWT,
  validate(validator.forwardMessageSchema),
  controller.forwardMessage,
);
router.put('/:id/messages/:messageId/star', verifyJWT, controller.starMessage);
router.delete('/:id/messages/:messageId/star', verifyJWT, controller.unstarMessage);
router.post('/:id/read', verifyJWT, controller.markConversationRead);
router.put('/:id/mute', verifyJWT, validate(validator.muteSchema), controller.muteConversation);
router.delete('/:id/mute', verifyJWT, controller.unmuteConversation);
router.get('/:id', verifyJWT, controller.getConversationById);
router.delete('/:id', verifyJWT, controller.leaveConversation);
router.patch('/:id/clear', verifyJWT, controller.clearConversation);

const starredRouter = Router();

starredRouter.get('/starred', verifyJWT, controller.getStarredMessages);

export default router;
export { starredRouter };

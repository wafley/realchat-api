import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import * as validator from './friends.validator';
import * as controller from './friends.controller';

const friendRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many friend requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.get('/', verifyJWT, controller.getFriends);
router.post(
  '/request',
  verifyJWT,
  friendRequestLimiter,
  validate(validator.sendRequestSchema),
  controller.sendRequest,
);
router.get('/requests', verifyJWT, controller.getIncomingRequests);
router.get('/requests/sent', verifyJWT, controller.getSentRequests);
router.post('/accept', verifyJWT, validate(validator.requestIdSchema), controller.acceptRequest);
router.post('/reject', verifyJWT, validate(validator.requestIdSchema), controller.rejectRequest);
router.delete(
  '/request/:userId',
  verifyJWT,
  validate(validator.userIdParamSchema),
  controller.cancelRequest,
);
router.delete('/:userId', verifyJWT, validate(validator.userIdParamSchema), controller.unfriend);

export default router;

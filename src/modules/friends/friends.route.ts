import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import * as validator from './friends.validator';
import * as controller from './friends.controller';

const router = Router();

router.post('/me/following/:userId', verifyJWT, validate(validator.userIdParamSchema, 'params'), controller.followUser);
router.delete('/me/following/:userId', verifyJWT, validate(validator.userIdParamSchema, 'params'), controller.unfollowUser);
router.get('/me/following', verifyJWT, controller.getMyFollowing);
router.get('/me/followers', verifyJWT, controller.getMyFollowers);
router.get('/users/:userId/following', verifyJWT, validate(validator.userIdParamSchema, 'params'), controller.getUserFollowing);
router.get('/users/:userId/followers', verifyJWT, validate(validator.userIdParamSchema, 'params'), controller.getUserFollowers);
router.get('/users/:userId/relationship', verifyJWT, validate(validator.userIdParamSchema, 'params'), controller.getRelationship);

export default router;

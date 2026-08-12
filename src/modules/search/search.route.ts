import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import * as validator from './search.validator';
import * as controller from './search.controller';

const router = Router();

router.get(
  '/users',
  verifyJWT,
  validate(validator.searchQuerySchema, 'query'),
  controller.searchUsers,
);
router.get(
  '/groups',
  verifyJWT,
  validate(validator.searchQuerySchema, 'query'),
  controller.searchGroups,
);
router.get(
  '/messages',
  verifyJWT,
  validate(validator.messageSearchQuerySchema, 'query'),
  controller.searchMessages,
);

const dmRouter = Router();

dmRouter.get(
  '/search',
  verifyJWT,
  validate(validator.searchQuerySchema, 'query'),
  controller.searchDmMessages,
);

export default router;
export { dmRouter as dmSearchRouter };

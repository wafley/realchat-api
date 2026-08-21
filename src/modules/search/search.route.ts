/**
 * Definisi rute pencarian (dipasang di bawah prefix /search) dan sub-router
 * pencarian pesan DM. Semua endpoint dilindungi verifyJWT serta memvalidasi
 * query sebelum masuk ke controller.
 */
import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import { validate } from '../../middlewares/validate';
import * as validator from './search.validator';
import * as controller from './search.controller';

const router = Router();

// Pencarian global: user, grup, dan pesan (opsional per percakapan).
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

// Sub-router pencarian pesan DM, dipasang terpisah pada prefix percakapan DM.
const dmRouter = Router();

dmRouter.get(
  '/search',
  verifyJWT,
  validate(validator.searchQuerySchema, 'query'),
  controller.searchDmMessages,
);

/** Router utama endpoint /search (users, groups, messages). */
export default router;
/** Sub-router pencarian pesan DM (dipasang pada prefix percakapan DM). */
export { dmRouter as dmSearchRouter };

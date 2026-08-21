/**
 * Handler HTTP untuk endpoint pencarian (user, grup, pesan, pesan DM).
 * Memvalidasi query dengan skema Zod, memanggil service terkait, lalu
 * merespons JSON; error diteruskan ke middleware penanganan error.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as searchService from './search.service';
import { searchQuerySchema, messageSearchQuerySchema } from './search.validator';

/** GET /search/users — cari user berdasarkan username atau nama lengkap. */
export async function searchUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { q, limit } = searchQuerySchema.parse(req.query);
    const users = await searchService.searchUsers(req.userId!, q, limit);
    res.status(200).json({ success: true, data: { users } });
  } catch (error) {
    next(error);
  }
}

/** GET /search/groups — cari grup yang diikuti user berdasarkan nama. */
export async function searchGroups(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { q, cursor, limit } = searchQuerySchema.parse(req.query);
    const result = await searchService.searchGroups(req.userId!, q, cursor, limit);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /search/messages — cari pesan; opsional terbatas pada satu percakapan
 * dengan filter rentang waktu (before/after) dan cursor pagination.
 */
export async function searchMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { q, conversationId, before, after, cursor, limit } = messageSearchQuerySchema.parse(
      req.query,
    );
    const result = await searchService.searchMessages(req.userId!, {
      q,
      conversationId,
      before: before ? new Date(before) : undefined,
      after: after ? new Date(after) : undefined,
      cursor,
      limit,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** GET /conversations/dm/search — cari pesan di semua percakapan DM user. */
export async function searchDmMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { q, cursor, limit } = searchQuerySchema.parse(req.query);
    const result = await searchService.searchDmMessages(req.userId!, q, cursor, limit);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * Skema validasi Zod untuk query pencarian: kata kunci wajib (1-100 karakter),
 * cursor ISO datetime opsional untuk paginasi, dan limit dengan default 50.
 */
import { z } from 'zod';

/** Query dasar pencarian user/grup/pesan DM: q, cursor, dan limit. */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  cursor: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

/** Query pencarian pesan: menambahkan filter conversationId dan rentang waktu. */
export const messageSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  conversationId: z.string().uuid().optional(),
  before: z.iso.datetime().optional(),
  after: z.iso.datetime().optional(),
  cursor: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

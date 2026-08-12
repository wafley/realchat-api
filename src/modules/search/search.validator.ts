import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  cursor: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const messageSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  conversationId: z.string().uuid().optional(),
  before: z.iso.datetime().optional(),
  after: z.iso.datetime().optional(),
  cursor: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

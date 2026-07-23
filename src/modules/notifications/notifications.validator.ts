import { z } from 'zod';

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});

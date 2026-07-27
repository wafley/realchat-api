import { z } from 'zod';

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const sortQuerySchema = z.object({
  sort: z.enum(['recent', 'alphabetical']).optional(),
});

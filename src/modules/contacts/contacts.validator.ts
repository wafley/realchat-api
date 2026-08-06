import { z } from 'zod';

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const sortQuerySchema = z.object({
  sort: z.enum(['recent', 'alphabetical']).optional(),
});

export const bulkContactsSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
});

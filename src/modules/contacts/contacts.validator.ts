import { z } from 'zod';

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const contactListQuerySchema = z.object({
  search: z.string().trim().optional(),
  sort: z.enum(['recent', 'alphabetical']).optional(),
});

export const bulkContactsSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
});

export const addContactByUsernameSchema = z
  .object({
    username: z.string().trim().min(3).max(30),
    customName: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

export const updateCustomNameSchema = z
  .object({
    customName: z.string().trim().max(50),
  })
  .strict();

import { z } from 'zod';

export const groupIdUserIdSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export const addMembersSchema = z
  .object({
    userIds: z.array(z.string().uuid()).min(1).max(50),
  })
  .strict();

export const roleSchema = z
  .object({
    role: z.enum(['ADMIN', 'MEMBER']),
  })
  .strict();

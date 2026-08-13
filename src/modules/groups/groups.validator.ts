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

export const createGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    participantIds: z.preprocess((value) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    }, z.array(z.string().uuid()).min(2).max(49)),
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

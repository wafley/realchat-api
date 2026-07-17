import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    username: z.string().trim().min(3).max(30).optional(),
    bio: z.string().trim().max(500).optional().nullable(),
    statusText: z.string().trim().max(100).optional(),
  })
  .strict();

export const userIdSchema = z.object({
  id: z.string().uuid(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(50),
});

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(6).max(128),
  })
  .strict();

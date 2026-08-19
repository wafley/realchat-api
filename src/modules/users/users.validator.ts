import { z } from 'zod';

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[A-Za-z0-9_]+$/, 'Username can only contain letters, numbers, and underscores');

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^\p{Cc}<>"'&]*$/u, 'Contains disallowed characters');

export const updateProfileSchema = z
  .object({
    username: usernameSchema.optional(),
    fullName: safeText(100)
      .refine((v) => v.length > 0, 'Cannot be empty')
      .optional(),
    bio: safeText(500).optional().nullable(),
    statusText: safeText(100).optional(),
  })
  .strict();

export const userIdSchema = z.object({
  id: z.string().uuid(),
});

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(6).max(128),
  })
  .strict();

import { z } from 'zod';

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}<>"'&]+$/u, 'Contains disallowed characters');

export const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[A-Za-z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    email: z.string().trim().email(),
    password: z.string().min(6).max(128),
    fullName: safeText(100).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(1),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.string().trim().email(),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(6).max(128),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();

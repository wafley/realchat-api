/**
 * Skema validasi Zod untuk seluruh endpoint autentikasi.
 * Dipakai middleware validate() sebelum request diteruskan ke controller.
 */
import { z } from 'zod';

// Teks aman: tolak karakter kontrol dan karakter berbahaya untuk HTML.
const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}<>"'&]+$/u, 'Contains disallowed characters');

const email = z
  .string()
  .trim()
  .email()
  .transform((v) => v.toLowerCase());

/** Skema payload registrasi: username, email, password, dan nama opsional. */
export const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[A-Za-z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    email,
    password: z.string().min(6).max(128),
    fullName: safeText(100).optional(),
  })
  .strict();

/** Skema payload login: email dan password wajib diisi. */
export const loginSchema = z
  .object({
    email,
    password: z.string().min(1),
  })
  .strict();

/** Skema payload refresh/logout: berisi refresh token dari klien. */
export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

/** Skema permintaan tautan reset password berdasarkan email. */
export const forgotPasswordSchema = z
  .object({
    email,
  })
  .strict();

/** Skema reset password: token reset dan password baru (min. 6 karakter). */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(6).max(128),
  })
  .strict();

/** Skema verifikasi email menggunakan token dari tautan email. */
export const verifyEmailSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();

/** Skema konfirmasi penghapusan akun: password wajib dikonfirmasi ulang. */
export const deleteAccountSchema = z
  .object({
    password: z.string().min(1),
  })
  .strict();

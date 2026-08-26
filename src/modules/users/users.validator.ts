/**
 * Skema validasi Zod untuk endpoint pengguna: pembaruan profil, parameter
 * ID pengguna, dan penggantian password.
 */
import { z } from 'zod';

// Aturan username: 3-30 karakter alfanumerik atau garis bawah.
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

/** Skema pembaruan profil: semua field opsional, tidak boleh field asing. */
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

/** Skema parameter rute berisi ID pengguna dalam format UUID. */
export const userIdSchema = z.object({
  id: z.string().uuid(),
});

/** Skema ganti password: password lama untuk konfirmasi, baru min. 6 karakter. */
export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(6).max(128),
  })
  .strict();

/** Nilai visibilitas privasi yang valid untuk kedua toggle pengaturan. */
export const privacyVisibilitySchema = z.enum(['EVERYONE', 'CONTACTS', 'NOBODY']);

/**
 * Skema pembaruan pengaturan privasi: kedua field opsional agar bisa
 * diubah parsial; field asing ditolak.
 */
export const updatePrivacySchema = z
  .object({
    lastSeenVisibility: privacyVisibilitySchema.optional(),
    groupInvitePolicy: privacyVisibilitySchema.optional(),
  })
  .strict();

/**
 * Skema pembaruan preferensi notifikasi: kedua field opsional agar bisa
 * diubah parsial; harus boolean ketat dan field asing ditolak.
 */
export const updateNotificationPreferencesSchema = z
  .object({
    notifyNewMessages: z.boolean().optional(),
    notifyGroupInvites: z.boolean().optional(),
  })
  .strict();

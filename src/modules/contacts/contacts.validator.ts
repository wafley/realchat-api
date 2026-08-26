/**
 * Skema validasi Zod untuk endpoint kontak: parameter userId, query daftar
 * kontak (pencarian & pengurutan), penambahan massal, dan nama kustom.
 */
import { z } from 'zod';

/** Skema parameter rute berisi ID pengguna dalam format UUID. */
export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

/** Skema query daftar kontak: kata kunci pencarian dan mode pengurutan. */
export const contactListQuerySchema = z.object({
  search: z.string().trim().optional(),
  sort: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['recent', 'alphabetical']).optional(),
  ),
});

/** Skema penambahan kontak massal: 1-100 ID pengguna sekaligus. */
export const bulkContactsSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
});

/** Skema menambah kontak berdasarkan username, dengan nama kustom opsional. */
export const addContactByUsernameSchema = z
  .object({
    username: z.string().trim().min(3).max(30),
    customName: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

/** Skema pembaruan nama kustom kontak (1-50 karakter). */
export const updateCustomNameSchema = z
  .object({
    customName: z.string().trim().min(1).max(50),
  })
  .strict();

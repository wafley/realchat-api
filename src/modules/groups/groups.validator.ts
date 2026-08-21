/**
 * Skema validasi Zod untuk endpoint modul grup: params rute bersarang,
 * pembuatan/pembaruan grup, penambahan anggota, dan perubahan peran.
 */
import { z } from 'zod';

/** Params rute bersarang :id grup dan :userId target. */
export const groupIdUserIdSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

/** Body pembaruan grup: nama dan/atau deskripsi (boleh null). */
export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

/**
 * Body pembuatan grup via multipart/form-data. participantIds dikirim
 * sebagai string JSON (keterbatasan multipart) berisi 2-49 UUID unik
 * di luar ID pembuat.
 */
export const createGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    participantIds: z.preprocess(
      // Multipart tidak mendukung tipe array; klien mengirim JSON string.
      (value) => {
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;
      },
      z
        .array(z.string().uuid())
        .min(2)
        .max(49)
        .refine((arr) => new Set(arr).size === arr.length, {
          message: 'Duplicate participant IDs are not allowed',
        }),
    ),
  })
  .strict();

/** Body tambah anggota: 1-50 UUID unik. */
export const addMembersSchema = z
  .object({
    userIds: z
      .array(z.string().uuid())
      .min(1)
      .max(50)
      .refine((arr) => new Set(arr).size === arr.length, {
        message: 'Duplicate user IDs are not allowed',
      }),
  })
  .strict();

/** Body ubah peran: hanya ADMIN atau MEMBER. */
export const roleSchema = z
  .object({
    role: z.enum(['ADMIN', 'MEMBER']),
  })
  .strict();

/**
 * Skema validasi Zod untuk modul notifikasi: parameter paginasi umum
 * dan parameter path berisi id notifikasi (format UUID).
 */
import { z } from 'zod';

/** Validasi query paginasi (limit/offset) dengan nilai default yang aman. */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/** Validasi parameter path :id yang harus berupa UUID notifikasi. */
export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});

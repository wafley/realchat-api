/**
 * Skema validasi Zod untuk body endpoint perangkat: token FCM dan platform.
 * Keduanya strict agar field tak dikenal ditolak.
 */
import { z } from 'zod';

/** Validasi body registrasi: token (1-512 karakter) dan platform android/web. */
export const registerDeviceSchema = z
  .object({
    token: z.string().trim().min(1).max(512),
    platform: z.enum(['android', 'web']),
  })
  .strict();

/** Validasi body penghapusan perangkat: hanya token yang diperlukan. */
export const unregisterDeviceSchema = z
  .object({
    token: z.string().trim().min(1).max(512),
  })
  .strict();

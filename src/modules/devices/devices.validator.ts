import { z } from 'zod';

export const registerDeviceSchema = z
  .object({
    token: z.string().trim().min(1).max(512),
    platform: z.enum(['android', 'web']),
  })
  .strict();

export const unregisterDeviceSchema = z
  .object({
    token: z.string().trim().min(1).max(512),
  })
  .strict();

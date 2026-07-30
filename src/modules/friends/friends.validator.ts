import { z } from 'zod';

export const sendRequestSchema = z
  .object({
    userId: z.string().uuid(),
  })
  .strict();

export const requestIdSchema = z
  .object({
    requestId: z.string().uuid(),
  })
  .strict();

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

import { z } from 'zod';

export const conversationIdSchema = z.object({
  id: z.string().uuid(),
});

export const createConversationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('PRIVATE'),
      participantId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('GROUP'),
      name: z.string().trim().min(1).max(100),
      participantIds: z.array(z.string().uuid()).min(2),
    })
    .strict(),
]);

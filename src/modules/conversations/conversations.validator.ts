import { z } from 'zod';

export const messageIdSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
});

export const editMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(5000),
  })
  .strict();

export const sendMessageSchema = z
  .object({
    conversationId: z.string().uuid(),
    content: z.string().trim().min(1).max(5000),
    replyToId: z.string().uuid().or(z.literal('')).optional(),
  })
  .strict();

export const messageSeenSchema = z
  .object({
    conversationId: z.string().uuid(),
    lastSeenMessageId: z.string().uuid(),
  })
  .strict();

export const pinMessageSchema = z
  .object({
    messageId: z.string().uuid(),
  })
  .strict();

export const reactionSchema = z
  .object({
    messageId: z.string().uuid(),
    emoji: z.string().trim().min(1).max(10),
  })
  .strict();

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const conversationListQuerySchema = z.object({
  search: z.string().trim().optional(),
  cursor: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
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

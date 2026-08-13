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

export const forwardMessageSchema = z
  .object({
    targetConversationId: z.string().uuid(),
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

export const muteSchema = z
  .object({
    until: z.string().datetime().optional(),
  })
  .strict();

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const conversationListQuerySchema = z.object({
  search: z.string().trim().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const createConversationSchema = z
  .object({
    type: z.literal('PRIVATE'),
    participantId: z.string().uuid(),
  })
  .strict();

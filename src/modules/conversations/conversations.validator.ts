/**
 * Skema validasi Zod untuk endpoint modul percakapan.
 * Dipakai middleware validate (body/query) maupun controller (params)
 * agar bentuk data masuk seragam sebelum menuju lapisan service.
 */
import { z } from 'zod';

/** Params rute bersarang :id/:messageId (keduanya harus UUID). */
export const messageIdSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
});

/** Params rute :id percakapan. */
export const conversationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// Preprocess: string kosong/whitespace dianggap field tidak dikirim.
const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Body kirim pesan lampiran: caption/replyToId kosong dianggap tidak
 * ada; duration dinormalisasi jadi bilangan bulat detik (0-86400).
 */
export const uploadMessageSchema = z
  .object({
    caption: z.preprocess(emptyStringToUndefined, z.string().trim().max(5000).optional()),
    replyToId: z.preprocess(emptyStringToUndefined, z.string().uuid().optional()),
    duration: z.preprocess((value) => {
      if (value === undefined || value === null || value === '') return undefined;
      const number = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(number) && number >= 0 ? Math.round(number) : undefined;
    }, z.number().int().min(0).max(86400).optional()),
  })
  .strict();

/** Body edit pesan: isi wajib 1-5000 karakter setelah trim. */
export const editMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(5000),
  })
  .strict();

/** Body kirim pesan teks via socket; replyToId boleh string kosong. */
export const sendMessageSchema = z
  .object({
    conversationId: z.string().uuid(),
    content: z.string().trim().min(1).max(5000),
    replyToId: z.string().uuid().or(z.literal('')).optional(),
  })
  .strict();

/** Payload socket penanda pesan terakhir yang dibaca klien. */
export const messageSeenSchema = z
  .object({
    conversationId: z.string().uuid(),
    lastSeenMessageId: z.string().uuid(),
  })
  .strict();

/** Body teruskan pesan: UUID percakapan tujuan. */
export const forwardMessageSchema = z
  .object({
    targetConversationId: z.string().uuid(),
  })
  .strict();

/** Body sematkan pesan via socket. */
export const pinMessageSchema = z
  .object({
    messageId: z.string().uuid(),
  })
  .strict();

/** Body reaksi: emoji 1-10 karakter. */
export const reactionSchema = z
  .object({
    messageId: z.string().uuid(),
    emoji: z.string().trim().min(1).max(10),
  })
  .strict();

/** Body bisu percakapan: until ISO datetime opsional. */
export const muteSchema = z
  .object({
    until: z.string().datetime().optional(),
  })
  .strict();

/** Query paginasi generik: kursor opsional, limit 1-100 (default 50). */
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

/** Query daftar percakapan: pencarian, kursor, limit 1-50 (default 20). */
export const conversationListQuerySchema = z.object({
  search: z.string().trim().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

/** Body buat percakapan; hanya tipe PRIVATE yang diizinkan. */
export const createConversationSchema = z
  .object({
    type: z.literal('PRIVATE'),
    participantId: z.string().uuid(),
  })
  .strict();

/**
 * Controller HTTP modul percakapan: menguraikan & memvalidasi request,
 * memanggil service terkait, lalu membungkus hasil/error ke respons
 * JSON dengan format { success, message?, data }.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import { BadRequestError } from '../../utils/errors';
import * as conversationService from './conversations.service';
import {
  conversationListQuerySchema,
  conversationIdParamsSchema,
  messageIdSchema,
  paginationSchema,
  uploadMessageSchema,
  addReactionBodySchema,
} from './conversations.validator';

/** Membuat percakapan privat baru dengan satu partisipan. */
export async function createConversation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await conversationService.createConversation(req.userId!, req.body);
    res.status(201).json({ success: true, message: 'Conversation created', data: result });
  } catch (error) {
    next(error);
  }
}

/** Daftar percakapan pengguna dengan pencarian dan paginasi kursor. */
export async function getConversations(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { search, cursor, limit } = conversationListQuerySchema.parse(req.query);
    const result = await conversationService.getConversations(req.userId!, {
      search,
      cursor,
      limit,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Detail satu percakapan beserta daftar anggotanya. */
export async function getConversationById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await conversationService.getConversationDetail(
      req.userId!,
      req.params.id as string,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Keluar dari percakapan (privat disembunyikan, grup didelegasikan). */
export async function leaveConversation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await conversationService.leaveConversation(req.userId!, req.params.id as string);
    res.status(200).json({ success: true, message: 'Left conversation' });
  } catch (error) {
    next(error);
  }
}

/** Bersihkan riwayat percakapan untuk diri sendiri. */
export async function clearConversation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await conversationService.clearConversation(
      req.userId!,
      req.params.id as string,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Bisukan percakapan sampai waktu tertentu. */
export async function muteConversation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await conversationService.setConversationMute(
      req.userId!,
      req.params.id as string,
      req.body.until,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Matikan bisu percakapan. */
export async function unmuteConversation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await conversationService.unmuteConversation(
      req.userId!,
      req.params.id as string,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Daftar pesan percakapan dengan paginasi kursor komposit. */
export async function getMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { cursor, limit } = paginationSchema.parse(req.query);
    const result = await conversationService.getMessages(
      req.userId!,
      req.params.id as string,
      cursor,
      limit,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Kirim pesan dengan berkas lampiran hasil unggahan Multer. */
export async function sendMessageWithAttachment(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = conversationIdParamsSchema.parse(req.params);
    const body = uploadMessageSchema.parse(req.body);
    if (!req.file) throw new BadRequestError('File is required');
    const result = await conversationService.sendAttachmentMessage(req.userId!, id, body, req.file);
    res.status(201).json({ success: true, message: 'Message sent', data: result });
  } catch (error) {
    next(error);
  }
}

/** Daftar pesan tersemat pada percakapan. */
export async function getPinnedMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { limit } = paginationSchema.parse(req.query);
    const result = await conversationService.getPinnedMessages(
      req.userId!,
      req.params.id as string,
      limit,
    );
    res.status(200).json({ success: true, data: { messages: result } });
  } catch (error) {
    next(error);
  }
}

/** Edit isi pesan milik sendiri. */
export async function editMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const result = await conversationService.editMessage(
      req.userId!,
      id,
      messageId,
      req.body.content,
    );
    res.status(200).json({ success: true, message: 'Message edited', data: result });
  } catch (error) {
    next(error);
  }
}

/** Hapus (soft delete) pesan milik sendiri. */
export async function deleteMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    await conversationService.deleteMessage(req.userId!, id, messageId);
    res.status(200).json({ success: true, message: 'Message deleted' });
  } catch (error) {
    next(error);
  }
}

/** Sematkan pesan pada percakapan. */
export async function pinMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const result = await conversationService.setMessagePinned(req.userId!, id, messageId, true);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Lepas sematan pesan. */
export async function unpinMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const result = await conversationService.setMessagePinned(req.userId!, id, messageId, false);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Tandai semua pesan masuk percakapan sebagai SEEN. */
export async function markConversationRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await conversationService.markConversationAsRead(
      req.userId!,
      req.params.id as string,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Teruskan pesan dari percakapan sumber ke percakapan tujuan. */
export async function forwardMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const result = await conversationService.forwardMessage(
      req.userId!,
      id,
      messageId,
      req.body.targetConversationId as string,
    );
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Beri tanda bintang pada pesan. */
export async function starMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const result = await conversationService.setMessageStar(req.userId!, id, messageId, true);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Hapus tanda bintang pesan. */
export async function unstarMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const result = await conversationService.setMessageStar(req.userId!, id, messageId, false);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Daftar pembaca satu pesan untuk modal "Seen by". */
export async function getMessageReaders(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const result = await conversationService.getMessageReaders(req.userId!, id, messageId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Daftar seluruh pesan berbintang milik pengguna. */
export async function getStarredMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { cursor, limit } = paginationSchema.parse(req.query);
    const result = await conversationService.getStarredMessages(req.userId!, cursor, limit);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Tambahkan reaksi emoji pada pesan via REST. */
export async function addReactionREST(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const { emoji } = addReactionBodySchema.parse(req.body);
    const result = await conversationService.addReactionREST(req.userId!, id, messageId, emoji);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Hapus reaksi emoji dari pesan via REST. */
export async function removeReactionREST(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const result = await conversationService.removeReactionREST(req.userId!, id, messageId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Ambil seluruh reaksi untuk satu pesan. */
export async function getMessageReactions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const result = await conversationService.getMessageReactions(req.userId!, id, messageId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Daftar seluruh pesan yang direaksi pengguna lintas percakapan. */
export async function getReactedMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { cursor, limit } = paginationSchema.parse(req.query);
    const result = await conversationService.getReactedMessages(req.userId!, cursor, limit);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

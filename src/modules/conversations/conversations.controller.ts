import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as conversationService from './conversations.service';
import {
  conversationListQuerySchema,
  messageIdSchema,
  paginationSchema,
} from './conversations.validator';

export async function createConversation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await conversationService.createConversation(req.userId!, req.body);
    res.status(201).json({ success: true, message: 'Conversation created', data: result });
  } catch (error) {
    next(error);
  }
}

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

export async function leaveConversation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await conversationService.leaveConversation(req.userId!, req.params.id as string);
    res.status(200).json({ success: true, message: 'Left conversation' });
  } catch (error) {
    next(error);
  }
}

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

export async function deleteMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    await conversationService.deleteMessage(req.userId!, id, messageId);
    res.status(200).json({ success: true, message: 'Message deleted' });
  } catch (error) {
    next(error);
  }
}

export async function pinMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const result = await conversationService.setMessagePinned(req.userId!, id, messageId, true);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function unpinMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id, messageId } = messageIdSchema.parse(req.params);
    const result = await conversationService.setMessagePinned(req.userId!, id, messageId, false);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

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

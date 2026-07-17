import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as conversationService from './conversations.service';

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
    const result = await conversationService.getConversations(req.userId!);
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

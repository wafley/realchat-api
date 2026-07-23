import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as friendService from './friends.service';

export async function sendRequest(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await friendService.sendRequest(req.userId!, req.body.userId);
    res.status(201).json({ success: true, message: 'Friend request sent', data: result });
  } catch (error) {
    next(error);
  }
}

export async function getIncomingRequests(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await friendService.getIncomingRequests(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getSentRequests(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await friendService.getSentRequests(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function cancelRequest(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await friendService.cancelRequest(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, message: 'Friend request cancelled' });
  } catch (error) {
    next(error);
  }
}

export async function getFriends(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await friendService.getFriends(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function acceptRequest(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await friendService.acceptRequest(req.userId!, req.body.requestId);
    res.status(200).json({ success: true, message: 'Friend request accepted', data: result });
  } catch (error) {
    next(error);
  }
}

export async function rejectRequest(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await friendService.rejectRequest(req.userId!, req.body.requestId);
    res.status(200).json({ success: true, message: 'Friend request rejected', data: result });
  } catch (error) {
    next(error);
  }
}

export async function unfriend(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await friendService.unfriend(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, message: 'Friend removed' });
  } catch (error) {
    next(error);
  }
}

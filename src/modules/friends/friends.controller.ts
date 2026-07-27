import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as friendService from './friends.service';

export async function followUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await friendService.followUser(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, message: 'User followed' });
  } catch (error) {
    next(error);
  }
}

export async function unfollowUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await friendService.unfollowUser(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, message: 'User unfollowed' });
  } catch (error) {
    next(error);
  }
}

export async function getMyFollowing(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const sort = req.query.sort as string | undefined;
    const result = await friendService.getMyFollowing(req.userId!, sort);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getMyFollowers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await friendService.getMyFollowers(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getUserFollowing(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await friendService.getUserFollowing(req.params.userId as string);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getUserFollowers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await friendService.getUserFollowers(req.params.userId as string);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getRelationship(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await friendService.getRelationship(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, data: { status: result } });
  } catch (error) {
    next(error);
  }
}

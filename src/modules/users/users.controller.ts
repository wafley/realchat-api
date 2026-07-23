import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import { BadRequestError } from '../../utils/errors';
import * as userService from './users.service';
import { userIdSchema, searchQuerySchema } from './users.validator';

export async function getMe(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await userService.getProfile(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await userService.updateProfile(req.userId!, req.body);
    res.status(200).json({ success: true, message: 'Profile updated', data: result });
  } catch (error) {
    next(error);
  }
}

export async function getUserById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = userIdSchema.parse(req.params);
    const result = await userService.getUserById(id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function searchUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { q } = searchQuerySchema.parse(req.query);
    const result = await userService.searchUsers(req.userId!, q);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function uploadAvatar(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new BadRequestError('No file uploaded');
    const result = await userService.updateAvatar(req.userId!, req.file);
    res.status(200).json({ success: true, message: 'Avatar updated', data: result });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await userService.changePassword(req.userId!, req.body.oldPassword, req.body.newPassword);
    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
}

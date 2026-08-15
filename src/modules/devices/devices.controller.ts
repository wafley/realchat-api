import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as deviceService from './devices.service';

export async function registerDevice(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await deviceService.registerDevice(req.userId!, req.body);
    res.status(201).json({ success: true, message: 'Device registered', data: result });
  } catch (error) {
    next(error);
  }
}

export async function unregisterDevice(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await deviceService.unregisterDevice(req.userId!, req.body.token as string);
    res.status(200).json({ success: true, message: 'Device unregistered' });
  } catch (error) {
    next(error);
  }
}

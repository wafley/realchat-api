/**
 * Handler HTTP untuk endpoint perangkat (registrasi/penghapusan token FCM).
 * Input dibaca dari body yang sudah divalidasi middleware validate; error
 * diteruskan ke middleware penanganan error lewat next().
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as deviceService from './devices.service';

/** POST /devices — daftarkan token FCM milik user yang sedang login. */
export async function registerDevice(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await deviceService.registerDevice(req.userId!, req.body);
    res.status(201).json({ success: true, message: 'Device registered', data: result });
  } catch (error) {
    next(error);
  }
}

/** DELETE /devices — hapus token FCM milik user (mis. saat logout). */
export async function unregisterDevice(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await deviceService.unregisterDevice(req.userId!, req.body.token as string);
    res.status(200).json({ success: true, message: 'Device unregistered' });
  } catch (error) {
    next(error);
  }
}

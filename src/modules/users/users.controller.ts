/**
 * Controller endpoint pengguna: profil sendiri, profil publik, avatar,
 * ganti password, serta blokir/buka blokir. Meneruskan pekerjaan ke
 * users.service dan mengirim respons JSON.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import { BadRequestError } from '../../utils/errors';
import * as userService from './users.service';
import { userIdSchema } from './users.validator';

/** Mengembalikan profil lengkap pengguna yang sedang login. */
export async function getMe(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await userService.getProfile(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Memperbarui profil (username, nama, bio, status) milik sendiri. */
export async function updateMe(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await userService.updateProfile(req.userId!, req.body);
    res.status(200).json({ success: true, message: 'Profile updated', data: result });
  } catch (error) {
    next(error);
  }
}

/** Mengambil profil publik pengguna lain berdasarkan ID di parameter rute. */
export async function getUserById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = userIdSchema.parse(req.params);
    const result = await userService.getUserById(req.userId!, id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Mengunggah dan memperbarui avatar pengguna yang sedang login. */
export async function uploadAvatar(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new BadRequestError('No file uploaded');
    const result = await userService.updateAvatar(req.userId!, req.file);
    res.status(200).json({ success: true, message: 'Avatar updated', data: result });
  } catch (error) {
    next(error);
  }
}

/** Mengunggah dan memperbarui banner profil pengguna yang sedang login. */
export async function uploadBanner(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new BadRequestError('No file uploaded');
    const result = await userService.updateBanner(req.userId!, req.file);
    res.status(200).json({ success: true, message: 'Banner updated', data: result });
  } catch (error) {
    next(error);
  }
}

/** Mengganti password setelah memverifikasi password lama. */
export async function changePassword(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await userService.changePassword(req.userId!, req.body.oldPassword, req.body.newPassword);
    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
}

/** Set password untuk pengguna OAuth yang belum punya password. */
export async function setPassword(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await userService.setPassword(req.userId!, req.body.password);
    res.status(200).json({ success: true, message: 'Password set successfully' });
  } catch (error) {
    next(error);
  }
}

/** Memblokir pengguna lain berdasarkan ID di parameter rute. */
export async function blockUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = userIdSchema.parse(req.params);
    await userService.blockUser(req.userId!, id);
    res.status(201).json({ success: true, message: 'User blocked' });
  } catch (error) {
    next(error);
  }
}

/** Membuka blokir pengguna yang sebelumnya diblokir. */
export async function unblockUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = userIdSchema.parse(req.params);
    await userService.unblockUser(req.userId!, id);
    res.status(200).json({ success: true, message: 'User unblocked' });
  } catch (error) {
    next(error);
  }
}

/** Mengembalikan daftar pengguna yang diblokir oleh pengguna saat ini. */
export async function getBlockedUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await userService.getBlockedUsers(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Mengembalikan pengaturan privasi pengguna yang sedang login. */
export async function getPrivacy(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await userService.getPrivacySettings(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Memperbarui pengaturan privasi (last seen & kebijakan undangan grup). */
export async function updatePrivacy(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await userService.updatePrivacySettings(req.userId!, req.body);
    res.status(200).json({ success: true, message: 'Privacy settings updated', data: result });
  } catch (error) {
    next(error);
  }
}

/** Mengembalikan preferensi notifikasi pengguna yang sedang login. */
export async function getNotificationPreferences(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await userService.getNotificationPreferences(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Memperbarui preferensi notifikasi (push pesan masuk & undangan grup). */
export async function updateNotificationPreferences(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await userService.updateNotificationPreferences(req.userId!, req.body);
    res
      .status(200)
      .json({ success: true, message: 'Notification preferences updated', data: result });
  } catch (error) {
    next(error);
  }
}

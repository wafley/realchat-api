/**
 * Controller untuk endpoint autentikasi: registrasi, login, refresh/logout
 * token, reset & verifikasi email, serta penghapusan akun. Bertugas menerima
 * request HTTP, memanggil auth.service, dan mengirim respons JSON.
 */
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as authService from './auth.service';

/** Mendaftarkan pengguna baru lalu mengirim email verifikasi. */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, message: 'User registered successfully', data: result });
  } catch (error) {
    next(error);
  }
}

/** Memverifikasi kredensial lalu mengembalikan access & refresh token. */
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    res.status(200).json({ success: true, message: 'Login successful', data: result });
  } catch (error) {
    next(error);
  }
}

/** Menukar refresh token lama dengan pasangan token baru (rotasi). */
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.status(200).json({ success: true, message: 'Token refreshed', data: result });
  } catch (error) {
    next(error);
  }
}

/** Mencabut seluruh keluarga refresh token milik pengguna. */
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logout(req.body.refreshToken);
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

/** Mengirim tautan reset password ke email (respons selalu generik). */
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.forgotPassword(req.body.email);
    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    next(error);
  }
}

/** Menetapkan password baru menggunakan token reset yang valid. */
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.resetPassword(req.body.token, req.body.password);
    res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
}

/** Mengaktifkan akun pengguna melalui token verifikasi email. */
export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.verifyEmail(req.body.token);
    res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * Menghapus akun pengguna yang sedang login setelah konfirmasi password.
 * Data pengguna dianonimkan, bukan dihapus dari database.
 */
export async function deleteAccount(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await authService.deleteAccount(req.userId!, req.body.password);
    res.status(200).json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    next(error);
  }
}

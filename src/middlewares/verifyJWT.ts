/**
 * Middleware autentikasi berbasis JWT access token.
 * Memverifikasi header Authorization: Bearer, memastikan token bertipe
 * 'access', pengguna ada dan terverifikasi, serta token version cocok,
 * lalu menempelkan userId ke request untuk dipakai handler berikutnya.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import db from '../db/index';
import { users } from '../db/schema/users';
import { eq } from 'drizzle-orm';

/** Request Express yang sudah melewati verifyJWT dan membawa userId. */
export interface AuthRequest extends Request {
  /** ID pengguna dari payload token yang telah terverifikasi. */
  userId?: string;
}

/**
 * Memverifikasi access token JWT pada header Authorization.
 * @throws Tidak melempar; selalu merespons 401 JSON bila gagal.
 * @returns next() dengan req.userId terisi bila valid, atau respons 401.
 */
export async function verifyJWT(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Access token is required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.jwtAccessSecret) as {
      userId: string;
      type?: string;
      tv?: number;
    };

    // Token harus bertipe 'access'; refresh token tidak boleh dipakai di sini.
    if (decoded.type !== 'access') {
      res.status(401).json({ success: false, message: 'Invalid or expired access token' });
      return;
    }

    // Cek state pengguna terkini di DB: token masih sah walau pengguna
    // sudah dihapus (soft delete) atau belum verifikasi email.
    const [user] = await db
      .select({
        isVerified: users.isVerified,
        tokenVersion: users.tokenVersion,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (!user || user.deletedAt) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    if (!user.isVerified) {
      res.status(401).json({
        success: false,
        message: 'Please verify your email before accessing this resource',
      });
      return;
    }

    // Token version (tv) harus cocok dengan DB agar logout global /
    // rotasi token dapat membatalkan token lama yang masih berumur.
    if (decoded.tv !== user.tokenVersion) {
      res.status(401).json({ success: false, message: 'Invalid or expired access token' });
      return;
    }

    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired access token' });
  }
}

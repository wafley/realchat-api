/**
 * Utilitas pembuatan pasangan JWT: access token (umur pendek, membawa
 * token version) dan refresh token (secret terpisah, membawa jti unik
 * untuk deteksi pemakaian ulang/rotasi).
 */

import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';

/**
 * Membuat access token JWT berumur pendek.
 * @param payload Data pengguna yang disematkan (userId).
 * @param tokenVersion Versi token dari DB untuk pembatalan massal.
 * @returns Access token bertanda tangan dengan klaim type='access'.
 */
export function generateAccessToken(payload: { userId: string }, tokenVersion: number): string {
  return jwt.sign({ ...payload, type: 'access', tv: tokenVersion }, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Membuat refresh token JWT berumur panjang dengan jti (UUID) unik.
 * @param payload Data pengguna yang disematkan (userId).
 * @returns Refresh token bertanda tangan dengan secret terpisah.
 */
export function generateRefreshToken(payload: { userId: string }): string {
  return jwt.sign({ ...payload, type: 'refresh', jti: randomUUID() }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  } as jwt.SignOptions);
}

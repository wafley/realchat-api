import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export function generateAccessToken(payload: { userId: string }): string {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpiresIn,
  } as jwt.SignOptions);
}

export function generateRefreshToken(payload: { userId: string }): string {
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  } as jwt.SignOptions);
}

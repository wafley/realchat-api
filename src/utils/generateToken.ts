import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';

export function generateAccessToken(payload: { userId: string }): string {
  return jwt.sign({ ...payload, type: 'access' }, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpiresIn,
  } as jwt.SignOptions);
}

export function generateRefreshToken(payload: { userId: string }): string {
  return jwt.sign({ ...payload, type: 'refresh', jti: randomUUID() }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  } as jwt.SignOptions);
}

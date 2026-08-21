import * as repository from './auth.repository';
import * as conversationService from '../conversations/conversations.service';
import { hashPassword, comparePassword } from '../../utils/hashPassword';
import { generateAccessToken, generateRefreshToken } from '../../utils/generateToken';
import { sendVerificationEmail, sendResetPasswordEmail } from '../../utils/sendEmail';
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../../utils/errors';
import { unlinkQuietly } from '../../utils/cleanup';
import { env } from '../../config/env';
import { getIO } from '../../socket/index';
import jwt from 'jsonwebtoken';
import crypto, { randomUUID } from 'crypto';
import path from 'path';

export async function register(data: {
  username: string;
  email: string;
  password: string;
  fullName?: string;
}) {
  const email = data.email.toLowerCase();
  const existingEmail = await repository.findUserByEmail(email);
  if (existingEmail) {
    throw new ConflictError('Email already registered');
  }

  const existingUsername = await repository.findUserByUsername(data.username);
  if (existingUsername) {
    throw new ConflictError('Username already taken');
  }

  const passwordHash = await hashPassword(data.password);
  const user = await repository.createUser({
    username: data.username,
    email,
    passwordHash,
    fullName: data.fullName,
  });

  const verificationToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  await repository.saveVerificationToken(user.id, verificationToken, expiresAt);

  sendVerificationEmail(user.email, verificationToken).catch(console.error);

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
  };
}

export async function login(email: string, password: string) {
  const user = await repository.findUserByEmail(email.toLowerCase());
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isVerified) {
    throw new UnauthorizedError('Please verify your email before logging in');
  }
  const accessToken = generateAccessToken({ userId: user.id }, user.tokenVersion);
  const refreshToken = generateRefreshToken({ userId: user.id });
  const refreshPayload = jwt.decode(refreshToken) as { jti: string; exp: number };

  await repository.saveRefreshToken({
    userId: user.id,
    token: refreshToken,
    jti: refreshPayload.jti,
    familyId: randomUUID(),
    parentJti: null,
    expiredAt: new Date(refreshPayload.exp * 1000),
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username, email: user.email },
  };
}

function verifyRefreshToken(token: string) {
  try {
    const decoded = jwt.verify(token, env.jwtRefreshSecret) as {
      userId: string;
      type?: string;
      jti?: string;
    };
    if (decoded.type !== 'refresh' || !decoded.jti) {
      throw new Error('invalid refresh token');
    }
    return decoded as { userId: string; jti: string };
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}

export async function refresh(oldRefreshToken: string) {
  const decoded = verifyRefreshToken(oldRefreshToken);
  const row = await repository.findRefreshTokenByJti(decoded.jti);
  if (!row) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
  if (row.revokedAt) {
    await repository.revokeRefreshFamily(row.familyId);
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
  if (row.expiredAt.getTime() <= Date.now()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const newRefreshToken = generateRefreshToken({ userId: row.userId });
  const newPayload = jwt.decode(newRefreshToken) as { jti: string; exp: number };

  const rotated = await repository.rotateRefreshToken({
    oldJti: decoded.jti,
    familyId: row.familyId,
    userId: row.userId,
    newToken: newRefreshToken,
    newJti: newPayload.jti,
    parentJti: decoded.jti,
    expiredAt: new Date(newPayload.exp * 1000),
  });

  if (!rotated) {
    await repository.revokeRefreshFamily(row.familyId);
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await repository.findUserById(row.userId);
  if (!user) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const accessToken = generateAccessToken({ userId: row.userId }, user.tokenVersion);
  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string) {
  try {
    const decoded = jwt.verify(refreshToken, env.jwtRefreshSecret) as {
      type?: string;
      jti?: string;
    };
    if (decoded.type === 'refresh' && decoded.jti) {
      const row = await repository.findRefreshTokenByJti(decoded.jti);
      if (row) {
        await repository.revokeRefreshFamily(row.familyId);
      }
    }
  } catch {
    // Token is already invalid/expired — nothing to revoke.
  }
}

export async function forgotPassword(email: string) {
  const user = await repository.findUserByEmail(email.toLowerCase());

  let resetToken: string | undefined;

  if (user) {
    resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await repository.saveResetToken(user.id, resetToken, expiresAt);
    sendResetPasswordEmail(user.email, resetToken).catch(console.error);
  }

  return { message: 'If the email exists, a reset link has been sent.' };
}

export async function resetPassword(token: string, newPassword: string) {
  const user = await repository.findUserByResetToken(token);
  if (!user) {
    throw new BadRequestError('Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(newPassword);
  await repository.updatePassword(user.id, passwordHash);
  await repository.clearResetToken(user.id);
  await repository.deleteUserRefreshTokens(user.id);
  getIO().in(`user:${user.id}`).disconnectSockets(true);
}

export async function verifyEmail(token: string) {
  const user = await repository.findUserByVerificationToken(token);
  if (!user) {
    throw new BadRequestError('Invalid or expired verification token');
  }

  await repository.updateVerifiedStatus(user.id);
  await repository.clearVerificationToken(user.id);
}

export async function deleteAccount(userId: string, password: string) {
  const user = await repository.findUserById(userId);
  if (!user || user.deletedAt) {
    throw new NotFoundError('User not found');
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new ForbiddenError('Password is incorrect');
  }

  const conversationIds = await repository.findUserConversationIds(userId);
  for (const conversationId of conversationIds) {
    await conversationService.leaveConversation(userId, conversationId).catch(() => undefined);
  }

  const strippedId = userId.replace(/-/g, '');
  await repository.anonymizeUser(userId, {
    username: `deleted_${strippedId.slice(0, 20)}`,
    email: `deleted.${strippedId}@deleted.local`,
    passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
  });

  await repository.deleteUserRefreshTokens(userId);

  if (user.avatarUrl) {
    const filename = user.avatarUrl.split('/').pop();
    if (filename) {
      await unlinkQuietly(path.join(env.uploadDir, filename));
    }
  }

  getIO().in(`user:${userId}`).disconnectSockets(true);
}

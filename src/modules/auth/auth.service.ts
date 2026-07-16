import * as repository from './auth.repository';
import { hashPassword, comparePassword } from '../../utils/hashPassword';
import { generateAccessToken, generateRefreshToken } from '../../utils/generateToken';
import { sendVerificationEmail, sendResetPasswordEmail } from '../../utils/sendEmail';
import { ConflictError, UnauthorizedError, BadRequestError } from '../../utils/errors';
import crypto from 'crypto';

export async function register(data: { username: string; email: string; password: string }) {
  const existingEmail = await repository.findUserByEmail(data.email);
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
    email: data.email,
    passwordHash,
  });

  const verificationToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  await repository.saveVerificationToken(user.id, verificationToken, expiresAt);

  sendVerificationEmail(user.email, verificationToken).catch(console.error);

  return { id: user.id, username: user.username, email: user.email };
}

export async function login(email: string, password: string) {
  const user = await repository.findUserByEmail(email);
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const accessToken = generateAccessToken({ userId: user.id });
  const refreshToken = generateRefreshToken({ userId: user.id });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await repository.saveRefreshToken({
    userId: user.id,
    token: refreshToken,
    expiredAt: expiresAt,
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username, email: user.email },
  };
}

export async function refresh(oldRefreshToken: string) {
  const stored = await repository.findRefreshToken(oldRefreshToken);
  if (!stored) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  await repository.deleteRefreshToken(oldRefreshToken);

  const accessToken = generateAccessToken({ userId: stored.userId });
  const newRefreshToken = generateRefreshToken({ userId: stored.userId });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await repository.saveRefreshToken({
    userId: stored.userId,
    token: newRefreshToken,
    expiredAt: expiresAt,
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string) {
  await repository.deleteRefreshToken(refreshToken);
}

export async function forgotPassword(email: string) {
  const user = await repository.findUserByEmail(email);

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
}

export async function verifyEmail(token: string) {
  const user = await repository.findUserByVerificationToken(token);
  if (!user) {
    throw new BadRequestError('Invalid or expired verification token');
  }

  await repository.updateVerifiedStatus(user.id);
  await repository.clearVerificationToken(user.id);
}

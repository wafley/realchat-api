import * as repository from './auth.repository';
import { hashPassword, comparePassword } from '../../utils/hashPassword';
import { generateAccessToken, generateRefreshToken } from '../../utils/generateToken';
import { sendVerificationEmail, sendResetPasswordEmail } from '../../utils/sendEmail';
import { ConflictError, UnauthorizedError, BadRequestError } from '../../utils/errors';
import crypto from 'crypto';

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
  const userId = await repository.consumeRefreshToken(oldRefreshToken);
  if (!userId) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const accessToken = generateAccessToken({ userId }, 0);
  const newRefreshToken = generateRefreshToken({ userId });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await repository.saveRefreshToken({
    userId,
    token: newRefreshToken,
    expiredAt: expiresAt,
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string) {
  await repository.deleteRefreshToken(refreshToken);
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
}

export async function verifyEmail(token: string) {
  const user = await repository.findUserByVerificationToken(token);
  if (!user) {
    throw new BadRequestError('Invalid or expired verification token');
  }

  await repository.updateVerifiedStatus(user.id);
  await repository.clearVerificationToken(user.id);
}

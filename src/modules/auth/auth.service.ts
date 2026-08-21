/**
 * Logika bisnis autentikasi: registrasi, login, rotasi refresh token dengan
 * deteksi reuse, reset & verifikasi email, serta penghapusan akun secara
 * anonim. Menjembatani controller dengan repository dan layanan terkait.
 */
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

/**
 * Mendaftarkan pengguna baru: cek duplikat email/username, hash password,
 * lalu kirim email verifikasi (asinkron, tidak menahan respons).
 * @throws ConflictError jika email atau username sudah terdaftar
 */
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

/**
 * Memverifikasi kredensial lalu menerbitkan access & refresh token.
 * Refresh token pertama memulai keluarga (family) token baru.
 * @throws UnauthorizedError jika kredensial salah, akun dihapus, atau email belum diverifikasi
 */
export async function login(email: string, password: string) {
  const user = await repository.findUserByEmail(email.toLowerCase());
  // Guard deletedAt: akun yang sudah dihapus tidak boleh login lagi.
  if (!user || user.deletedAt) {
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

/** Memverifikasi JWT refresh token: tipe harus 'refresh' dan jti wajib ada. */
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

/**
 * Merotasi refresh token: token lama dicabut dan diganti token baru dalam
 * keluarga yang sama. Jika token lama sudah dicabut (indikasi pencurian/
 * reuse), seluruh keluarga token langsung dicabut.
 * @throws UnauthorizedError untuk token tidak valid, kedaluwarsa, atau reuse terdeteksi
 */
export async function refresh(oldRefreshToken: string) {
  const decoded = verifyRefreshToken(oldRefreshToken);
  const row = await repository.findRefreshTokenByJti(decoded.jti);
  if (!row) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
  // Token yang sudah dicabut dipakai ulang: anggap serangan, cabut satu keluarga.
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

  // Rotasi gagal berarti token lama sudah pernah dipakai: cabut satu keluarga.
  if (!rotated) {
    await repository.revokeRefreshFamily(row.familyId);
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await repository.findUserById(row.userId);
  // Guard deletedAt: token milik akun yang sudah dihapus tidak diperbarui.
  if (!user || user.deletedAt) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const accessToken = generateAccessToken({ userId: row.userId }, user.tokenVersion);
  return { accessToken, refreshToken: newRefreshToken };
}

/** Mencabut keluarga refresh token dari token yang diberikan; idempotent. */
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

/**
 * Mengirim tautan reset password. Respons selalu generik agar keberadaan
 * email pengguna tidak bisa ditebak (mencegah user enumeration).
 */
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

/**
 * Menetapkan password baru dari token reset: hash password disimpan,
 * tokenVersion dinaikkan (access token lama mati), refresh token dicabut,
 * dan semua socket aktif pengguna diputus.
 * @throws BadRequestError jika token reset tidak valid atau kedaluwarsa
 */
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

/** Memverifikasi email pengguna dari token lalu mengaktifkan akunnya. */
export async function verifyEmail(token: string) {
  const user = await repository.findUserByVerificationToken(token);
  if (!user) {
    throw new BadRequestError('Invalid or expired verification token');
  }

  await repository.updateVerifiedStatus(user.id);
  await repository.clearVerificationToken(user.id);
}

/**
 * Menghapus akun: keluar dari semua percakapan, lalu menganonimkan identitas
 * (username/email acak, password acak, deletedAt diisi) agar riwayat pesan
 * tetap konsisten tanpa membuka data pribadi. Avatar fisik ikut dihapus.
 * @throws NotFoundError jika pengguna tidak ada atau sudah dihapus
 * @throws ForbiddenError jika password konfirmasi salah
 */
export async function deleteAccount(userId: string, password: string) {
  const user = await repository.findUserById(userId);
  // Guard deletedAt: cegah penghapusan ganda pada akun yang sudah dianonimkan.
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

  // Anonimisasi: identitas diganti nilai acak berbasis ID tanpa tanda hubung.
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

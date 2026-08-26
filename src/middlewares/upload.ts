/**
 * Konfigurasi Multer untuk upload file ke disk.
 * Menyediakan factory createUpload dengan batas ukuran dan whitelist
 * MIME type, lalu mengekspor tiga instance siap pakai: avatar,
 * foto grup, dan lampiran pesan.
 */

import multer from 'multer';
import path from 'path';
import { env } from '../config/env';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_MESSAGE_TYPES,
  MAX_AVATAR_SIZE,
  MAX_BANNER_SIZE,
  MAX_GROUP_PHOTO_SIZE,
} from '../config/constants';
import { BadRequestError } from '../utils/errors';

// Simpan ke env.uploadDir dengan nama unik (timestamp + angka acak);
// ekstensi asli dipertahankan sementara, akan dikoreksi oleh imageValidation.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

/**
 * Membuat instance Multer dengan batas ukuran dan filter tipe file.
 * @param maxSize Batas ukuran file dalam byte (ditolak dengan 413).
 * @param allowedTypes Daftar MIME type yang diizinkan.
 * @param rejectMessage Pesan error saat tipe file tidak sesuai.
 */
function createUpload(maxSize: number, allowedTypes: readonly string[], rejectMessage: string) {
  const fileFilter = (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError(rejectMessage));
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxSize },
  });
}

/** Middleware upload avatar pengguna (hanya gambar JPEG/PNG/WebP). */
export const uploadAvatar = createUpload(
  MAX_AVATAR_SIZE,
  ALLOWED_IMAGE_TYPES,
  'Only JPEG, PNG, and WebP images are allowed',
);

/** Middleware upload banner profil pengguna (hanya gambar JPEG/PNG/WebP). */
export const uploadBanner = createUpload(
  MAX_BANNER_SIZE,
  ALLOWED_IMAGE_TYPES,
  'Only JPEG, PNG, and WebP images are allowed',
);

/** Middleware upload foto grup (hanya gambar JPEG/PNG/WebP). */
export const uploadGroupPhoto = createUpload(
  MAX_GROUP_PHOTO_SIZE,
  ALLOWED_IMAGE_TYPES,
  'Only JPEG, PNG, and WebP images are allowed',
);

/** Middleware upload lampiran pesan (foto + video, batas env.maxFileSize). */
export const uploadMessageAttachment = createUpload(
  env.maxFileSize,
  ALLOWED_MESSAGE_TYPES,
  'File type not allowed',
);

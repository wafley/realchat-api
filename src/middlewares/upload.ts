import multer from 'multer';
import path from 'path';
import { env } from '../config/env';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_MESSAGE_TYPES,
  MAX_AVATAR_SIZE,
  MAX_GROUP_PHOTO_SIZE,
} from '../config/constants';
import { BadRequestError } from '../utils/errors';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

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

export const uploadAvatar = createUpload(
  MAX_AVATAR_SIZE,
  ALLOWED_IMAGE_TYPES,
  'Only JPEG, PNG, and WebP images are allowed',
);

export const uploadGroupPhoto = createUpload(
  MAX_GROUP_PHOTO_SIZE,
  ALLOWED_IMAGE_TYPES,
  'Only JPEG, PNG, and WebP images are allowed',
);

export const uploadMessageAttachment = createUpload(
  env.maxFileSize,
  ALLOWED_MESSAGE_TYPES,
  'File type not allowed',
);

import multer from 'multer';
import path from 'path';
import { env } from '../config/env';
import { ALLOWED_IMAGE_TYPES, MAX_AVATAR_SIZE, MAX_GROUP_PHOTO_SIZE } from '../config/constants';
import { BadRequestError } from '../utils/errors';

function createUpload(maxSize: number) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, env.uploadDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  });

  const fileFilter = (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only JPEG, PNG, and WebP images are allowed'));
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxSize },
  });
}

export const uploadAvatar = createUpload(MAX_AVATAR_SIZE);

export const uploadGroupPhoto = createUpload(MAX_GROUP_PHOTO_SIZE);

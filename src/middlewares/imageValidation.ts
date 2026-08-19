import { Request, Response, NextFunction } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../config/env';
import { ALLOWED_MESSAGE_EXTENSIONS } from '../config/constants';
import { BadRequestError } from '../utils/errors';
import { unlinkQuietly } from '../utils/cleanup';

export type DetectedImageType = 'jpeg' | 'png' | 'webp';

const EXTENSIONS: Record<DetectedImageType, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
};

const MIME_TYPES: Record<DetectedImageType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function detectImageType(buffer: Buffer): DetectedImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export async function validateAndRenameImage(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      next();
      return;
    }

    const buffer = await fs.readFile(req.file.path);
    const type = detectImageType(buffer);
    if (!type) {
      await unlinkQuietly(req.file.path);
      next(new BadRequestError('File content is not a valid JPEG, PNG, or WebP image'));
      return;
    }

    const oldPath = req.file.path;
    const newFilename = `${path.basename(req.file.filename, path.extname(req.file.filename))}${EXTENSIONS[type]}`;
    const newPath = path.join(env.uploadDir, newFilename);
    await fs.rename(oldPath, newPath);

    req.file.filename = newFilename;
    req.file.path = newPath;
    req.file.mimetype = MIME_TYPES[type];
    next();
  } catch (error) {
    next(error);
  }
}

export async function validateMessageUpload(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      next(new BadRequestError('File is required'));
      return;
    }

    const buffer = await fs.readFile(req.file.path);
    const type = detectImageType(buffer);
    if (type) {
      const oldPath = req.file.path;
      const newFilename = `${path.basename(req.file.filename, path.extname(req.file.filename))}${EXTENSIONS[type]}`;
      const newPath = path.join(env.uploadDir, newFilename);
      await fs.rename(oldPath, newPath);

      req.file.filename = newFilename;
      req.file.path = newPath;
      req.file.mimetype = MIME_TYPES[type];
      next();
      return;
    }

    const isGif = req.file.mimetype === 'image/gif' && buffer.toString('ascii', 0, 4) === 'GIF8';
    if (isGif) {
      const oldPath = req.file.path;
      const newFilename = `${path.basename(req.file.filename, path.extname(req.file.filename))}.gif`;
      const newPath = path.join(env.uploadDir, newFilename);
      await fs.rename(oldPath, newPath);

      req.file.filename = newFilename;
      req.file.path = newPath;
      req.file.mimetype = 'image/gif';
      next();
      return;
    }

    if (req.file.mimetype.startsWith('image/')) {
      await unlinkQuietly(req.file.path);
      next(new BadRequestError('File content is not a valid image'));
      return;
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!ALLOWED_MESSAGE_EXTENSIONS.has(ext)) {
      await unlinkQuietly(req.file.path);
      next(new BadRequestError('File extension not allowed'));
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

import { Request, Response, NextFunction } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../config/env';
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

export type DetectedNonImageFamily =
  'pdf' | 'zip' | 'ole' | 'isobmff' | 'webm' | 'rar' | '7z' | 'text';

export function detectNonImageFamily(buffer: Buffer): DetectedNonImageFamily | null {
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  )
    return 'zip';
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  )
    return 'ole';
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'isobmff';
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  )
    return 'webm';
  if (
    buffer.length >= 7 &&
    buffer.toString('ascii', 0, 4) === 'Rar!' &&
    buffer[4] === 0x1a &&
    buffer[5] === 0x07 &&
    buffer[6] === 0x00
  )
    return 'rar';
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x37 &&
    buffer[1] === 0x7a &&
    buffer[2] === 0xbc &&
    buffer[3] === 0xaf &&
    buffer[4] === 0x27 &&
    buffer[5] === 0x1c
  )
    return '7z';
  if (buffer.length > 0 && !buffer.includes(0x00)) return 'text';
  return null;
}

const NON_IMAGE_SPECS: Record<
  string,
  { family: DetectedNonImageFamily; ext: string; mime: string }
> = {
  'application/pdf': { family: 'pdf', ext: '.pdf', mime: 'application/pdf' },
  'application/zip': { family: 'zip', ext: '.zip', mime: 'application/zip' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    family: 'zip',
    ext: '.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    family: 'zip',
    ext: '.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    family: 'zip',
    ext: '.pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  'application/msword': { family: 'ole', ext: '.doc', mime: 'application/msword' },
  'application/vnd.ms-excel': { family: 'ole', ext: '.xls', mime: 'application/vnd.ms-excel' },
  'application/vnd.ms-powerpoint': {
    family: 'ole',
    ext: '.ppt',
    mime: 'application/vnd.ms-powerpoint',
  },
  'video/mp4': { family: 'isobmff', ext: '.mp4', mime: 'video/mp4' },
  'video/quicktime': { family: 'isobmff', ext: '.mov', mime: 'video/quicktime' },
  'video/webm': { family: 'webm', ext: '.webm', mime: 'video/webm' },
  'application/x-7z-compressed': {
    family: '7z',
    ext: '.7z',
    mime: 'application/x-7z-compressed',
  },
  'application/x-rar-compressed': {
    family: 'rar',
    ext: '.rar',
    mime: 'application/x-rar-compressed',
  },
  'text/plain': { family: 'text', ext: '.txt', mime: 'text/plain' },
  'text/csv': { family: 'text', ext: '.csv', mime: 'text/csv' },
};

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

    const spec = NON_IMAGE_SPECS[req.file.mimetype];
    if (!spec) {
      await unlinkQuietly(req.file.path);
      next(new BadRequestError('File type not allowed'));
      return;
    }

    const family = detectNonImageFamily(buffer);
    if (family !== spec.family) {
      await unlinkQuietly(req.file.path);
      next(new BadRequestError('File content does not match the declared file type'));
      return;
    }

    const oldPath = req.file.path;
    const newFilename = `${path.basename(req.file.filename, path.extname(req.file.filename))}${spec.ext}`;
    const newPath = path.join(env.uploadDir, newFilename);
    await fs.rename(oldPath, newPath);

    req.file.filename = newFilename;
    req.file.path = newPath;
    req.file.mimetype = spec.mime;
    next();
  } catch (error) {
    next(error);
  }
}

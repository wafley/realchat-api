/**
 * Validasi keamanan file upload berdasarkan magic bytes (bukan sekadar
 * MIME header dari klien). Mendeteksi tipe gambar (JPEG/PNG/WebP) dan
 * keluarga file video (ISO-BMFF/WebM), lalu me-rename file di disk
 * sesuai tipe asli. Melindungi dari penyelundupan file yang menyamar.
 */

import { Request, Response, NextFunction } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../config/env';
import { BadRequestError } from '../utils/errors';
import { unlinkQuietly } from '../utils/cleanup';

/** Tipe gambar yang dikenali dari pemeriksaan magic bytes. */
export type DetectedImageType = 'jpeg' | 'png' | 'webp';

/** Pemetaan tipe gambar ke ekstensi file yang benar di disk. */
const EXTENSIONS: Record<DetectedImageType, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
};

/** Pemetaan tipe gambar ke MIME type resminya. */
const MIME_TYPES: Record<DetectedImageType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Mendeteksi tipe gambar dari magic bytes di awal buffer.
 * @param buffer Konten file yang dibaca dari disk.
 * @returns Tipe gambar ('jpeg' | 'png' | 'webp') atau null bila bukan
 *          ketiganya.
 */
export function detectImageType(buffer: Buffer): DetectedImageType | null {
  // JPEG: tiga byte pertama FF D8 FF.
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  // PNG: signature 8 byte 89 50 4E 47 0D 0A 1A 0A.
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
  // WebP: container RIFF dengan tag 'WEBP' pada offset 8.
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** Keluarga format non-gambar (video) yang dikenali dari magic bytes. */
export type DetectedNonImageFamily = 'isobmff' | 'webm';

/**
 * Mendeteksi keluarga format video dari magic bytes buffer.
 * Dipakai untuk memastikan lampiran video benar-benar sesuai klaim
 * MIME-nya (mp4/mov = isobmff, webm = EBML).
 * @param buffer Konten file yang dibaca dari disk.
 * @returns Nama keluarga format, atau null bila bukan video yang dikenali.
 */
export function detectNonImageFamily(buffer: Buffer): DetectedNonImageFamily | null {
  // ISO-BMFF (mp4/mov): 'ftyp' pada offset 4.
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'isobmff';
  // WebM/Matroska: EBML header 1A 45 DF A3.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  )
    return 'webm';
  return null;
}

/**
 * Spesifikasi MIME non-gambar (video) yang diizinkan untuk lampiran pesan:
 * memetakan setiap MIME ke keluarga magic bytes, ekstensi, dan MIME
 * kanonik yang dipakai saat me-rename file.
 */
const NON_IMAGE_SPECS: Record<
  string,
  { family: DetectedNonImageFamily; ext: string; mime: string }
> = {
  'video/mp4': { family: 'isobmff', ext: '.mp4', mime: 'video/mp4' },
  'video/quicktime': { family: 'isobmff', ext: '.mov', mime: 'video/quicktime' },
  'video/webm': { family: 'webm', ext: '.webm', mime: 'video/webm' },
};

/**
 * Middleware validasi upload gambar (avatar/foto grup).
 * Membaca file dari disk, memverifikasi magic bytes sesuai JPEG/PNG/WebP,
 * mencocokkannya dengan MIME yang diklaim klien, lalu me-rename file
 * dengan ekstensi yang benar. File invalid dihapus dan request ditolak.
 */
export async function validateAndRenameImage(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      next();
      return;
    }

    const buffer = await fs.readFile(req.file.path);
    const type = detectImageType(buffer);
    // Bukan gambar yang dikenali: hapus file dan tolak request.
    if (!type) {
      await unlinkQuietly(req.file.path);
      next(new BadRequestError('File content is not a valid JPEG, PNG, or WebP image'));
      return;
    }

    // MIME yang diklaim klien harus cocok dengan isi file sebenarnya.
    if (MIME_TYPES[type] !== req.file.mimetype) {
      await unlinkQuietly(req.file.path);
      next(new BadRequestError('File content does not match the declared file type'));
      return;
    }

    // Ganti nama file di disk dengan ekstensi hasil deteksi, lalu
    // perbarui metadata req.file agar handler memakai nilai yang benar.
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

/**
 * Middleware validasi lampiran pesan (foto + video).
 * Alur: gambar dikenali -> verifikasi & rename; MIME image/* lain -> tolak;
 * non-gambar (video) -> cek keluarga magic bytes terhadap NON_IMAGE_SPECS
 * lalu rename sesuai spesifikasinya.
 */
export async function validateMessageUpload(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      next(new BadRequestError('File is required'));
      return;
    }

    const buffer = await fs.readFile(req.file.path);
    const type = detectImageType(buffer);
    // Cabang 1: file adalah JPEG/PNG/WebP — verifikasi MIME lalu rename.
    if (type) {
      if (MIME_TYPES[type] !== req.file.mimetype) {
        await unlinkQuietly(req.file.path);
        next(new BadRequestError('File content does not match the declared file type'));
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
      return;
    }

    // Cabang 2: klaim image/* lain (mis. bmp/svg) tidak didukung — tolak.
    if (req.file.mimetype.startsWith('image/')) {
      await unlinkQuietly(req.file.path);
      next(new BadRequestError('File content is not a valid image'));
      return;
    }

    // Cabang 3: video — MIME harus terdaftar di NON_IMAGE_SPECS.
    const spec = NON_IMAGE_SPECS[req.file.mimetype];
    if (!spec) {
      await unlinkQuietly(req.file.path);
      next(new BadRequestError('File type not allowed'));
      return;
    }

    // Isi file harus sesuai keluarga format yang dijanjikan MIME-nya.
    const family = detectNonImageFamily(buffer);
    if (family !== spec.family) {
      await unlinkQuietly(req.file.path);
      next(new BadRequestError('File content does not match the declared file type'));
      return;
    }

    // Rename ke ekstensi kanonik dari spesifikasi, bukan ekstensi klien.
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

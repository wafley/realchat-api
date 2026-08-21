/**
 * Validasi keamanan file upload berdasarkan magic bytes (bukan sekadar
 * MIME header dari klien). Mendeteksi tipe gambar (JPEG/PNG/WebP) dan
 * keluarga file non-gambar, lalu me-rename file di disk sesuai tipe asli.
 * Melindungi dari penyelundupan file yang menyamar sebagai gambar/dokumen.
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

/** Keluarga format non-gambar yang dikenali dari magic bytes. */
export type DetectedNonImageFamily =
  'pdf' | 'zip' | 'ole' | 'isobmff' | 'webm' | 'rar' | '7z' | 'text';

/**
 * Mendeteksi keluarga format non-gambar dari magic bytes buffer.
 * Dipakai untuk memastikan lampiran dokumen benar-benar sesuai klaim
 * MIME-nya (mis. .docx adalah ZIP, .doc adalah OLE).
 * @param buffer Konten file yang dibaca dari disk.
 * @returns Nama keluarga format, atau null bila tidak dikenali.
 */
export function detectNonImageFamily(buffer: Buffer): DetectedNonImageFamily | null {
  // PDF: header '%PDF-'.
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
  // ZIP: 'PK\x03\x04' — juga mencakup docx/xlsx/pptx yang berbasis ZIP.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  )
    return 'zip';
  // OLE2 Compound File: signature D0 CF 11 E0 A1 B1 1A E1 (doc/xls/ppt lama).
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
  // RAR: 'Rar!' + marker 1A 07 00.
  if (
    buffer.length >= 7 &&
    buffer.toString('ascii', 0, 4) === 'Rar!' &&
    buffer[4] === 0x1a &&
    buffer[5] === 0x07 &&
    buffer[6] === 0x00
  )
    return 'rar';
  // 7z: signature 37 7A BC AF 27 1C.
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
  // Teks: dianggap teks bila tidak mengandung byte NOL sama sekali.
  if (buffer.length > 0 && !buffer.includes(0x00)) return 'text';
  return null;
}

/**
 * Spesifikasi MIME non-gambar yang diizinkan untuk lampiran pesan:
 * memetakan setiap MIME ke keluarga magic bytes, ekstensi, dan MIME
 * kanonik yang dipakai saat me-rename file.
 */
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
 * Middleware validasi lampiran pesan (gambar + dokumen non-gambar).
 * Alur: gambar dikenali -> verifikasi & rename; GIF -> verifikasi header
 * GIF8; MIME image/* lain -> tolak; non-gambar -> cek keluarga magic
 * bytes terhadap NON_IMAGE_SPECS lalu rename sesuai spesifikasinya.
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

    // Cabang 2: GIF — diverifikasi lewat header 'GIF8' karena GIF tidak
    // termasuk dalam detectImageType.
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

    // Cabang 3: klaim image/* lain (mis. bmp/svg) tidak didukung — tolak.
    if (req.file.mimetype.startsWith('image/')) {
      await unlinkQuietly(req.file.path);
      next(new BadRequestError('File content is not a valid image'));
      return;
    }

    // Cabang 4: non-gambar — MIME harus terdaftar di NON_IMAGE_SPECS.
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

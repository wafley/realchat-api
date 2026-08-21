/**
 * Error handler global Express: titik akhir semua error dari rute dan
 * middleware. Menerjemahkan ZodError, MulterError, AppError, dan error
 * PostgreSQL menjadi respons JSON { success, message } yang konsisten,
 * serta membersihkan file upload sementara saat request gagal.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import postgres from 'postgres';
import { AppError } from '../utils/errors';
import { unlinkQuietly } from '../utils/cleanup';

/**
 * Mencari kode error PostgreSQL dengan menelusuri rantai `cause` (maks.
 * 3 tingkat) karena driver postgres membungkus error asli.
 */
function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let i = 0; i < 3 && current; i++) {
    if (current instanceof postgres.PostgresError) return current.code;
    current = (current as { cause?: unknown })?.cause;
  }
  return undefined;
}

/**
 * Middleware penanganan error terakhir di pipeline Express.
 * @param err Error yang dilempar middleware/rute sebelumnya.
 * @returns Respons JSON sesuai jenis error; 500 untuk error tak dikenal.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  // Bersihkan file upload sementara agar tidak menumpuk saat request gagal.
  if (req.file?.path) {
    void unlinkQuietly(req.file.path);
  }

  // Body JSON rusak (hasil parse express.json gagal).
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
    return;
  }

  // Kegagalan validasi Zod: kirim daftar field bermasalah.
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.issues.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }

  // Error Multer: ukuran melebihi batas -> 413, sisanya -> 400.
  if (err instanceof MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // Error operasional aplikasi: pakai statusCode yang dibawa.
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // Pemetaan kode error PostgreSQL yang umum ke respons HTTP.
  const pgCode = pgErrorCode(err);
  if (pgCode === '23505') {
    res.status(409).json({ success: false, message: 'Conflict: resource already exists' });
    return;
  }
  if (pgCode === '23503') {
    res.status(404).json({ success: false, message: 'Referenced resource not found' });
    return;
  }
  if (pgCode === '22P02') {
    res.status(400).json({ success: false, message: 'Invalid value supplied' });
    return;
  }

  // Error tak dikenal: catat ke log, jangan bocorkan detail ke klien.
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
}

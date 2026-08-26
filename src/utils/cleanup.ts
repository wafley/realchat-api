/**
 * Utilitas pembersihan file di direktori upload.
 * Dipakai oleh middleware validasi dan errorHandler untuk menghapus
 * file sementara yang gagal validasi tanpa memicu error berantai.
 */

import { promises as fs } from 'fs';

/**
 * Menghapus file pada path tertentu dan menelan semua error.
 * @param filePath Path absolut/relatif file yang akan dihapus.
 * @returns Selalu resolve; kegagalan hapus (mis. file sudah hilang) diabaikan.
 */
export async function unlinkQuietly(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore
  }
}

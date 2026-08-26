/**
 * Kumpulan error kustom berbasis HTTP status code.
 * Setiap error operasional di API diharapkan mewarisi AppError agar
 * errorHandler dapat menerjemahkannya menjadi respons JSON yang konsisten.
 */

/** Error dasar dengan status HTTP; semua error operasional turunan dari ini. */
export class AppError extends Error {
  /** Kode status HTTP yang dikirim ke klien saat error ini dilempar. */
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
  }
}

/** Error permintaan tidak valid (HTTP 400). */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

/** Error kredensial tidak valid atau belum login (HTTP 401). */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

/** Error akses ditolak karena tidak punya izin (HTTP 403). */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

/** Error resource yang diminta tidak ditemukan (HTTP 404). */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

/** Error konflik state, mis. username/email sudah dipakai (HTTP 409). */
export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

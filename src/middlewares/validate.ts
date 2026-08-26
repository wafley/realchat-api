/**
 * Middleware validasi berbasis Zod.
 * Memvalidasi body/params/query request terhadap skema yang diberikan
 * sebelum handler dijalankan; kegagalan validasi diteruskan ke errorHandler.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Membuat middleware yang memvalidasi bagian request dengan skema Zod.
 * @param schema Skema Zod untuk memvalidasi data masukan.
 * @param source Bagian request yang divalidasi; default 'body'.
 * @returns Middleware Express; hasil parse menggantikan req.body agar
 *          handler menerima data yang sudah dinormalisasi skema.
 */
export function validate(schema: ZodSchema, source: 'body' | 'params' | 'query' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (source === 'body') {
        // Hanya body yang ditimpa hasil parse; params/query bersifat read-only.
        req.body = schema.parse(req.body);
      } else {
        schema.parse(source === 'params' ? req.params : req.query);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

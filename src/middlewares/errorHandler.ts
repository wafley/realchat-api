import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AppError } from '../utils/errors';
import { unlinkQuietly } from '../utils/cleanup';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (req.file?.path) {
    void unlinkQuietly(req.file.path);
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.issues.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }

  if (err instanceof MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      success: false,
      message: err.message,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
}

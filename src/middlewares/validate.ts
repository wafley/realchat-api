import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.issues.map((e: ZodIssue) => ({
            field: (e as { path: (string | number)[] }).path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}

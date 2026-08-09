import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse(source === 'body' ? req.body : req.params);
      next();
    } catch (error) {
      next(error);
    }
  };
}

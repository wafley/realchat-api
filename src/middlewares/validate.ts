import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'params' | 'query' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse(source === 'body' ? req.body : source === 'params' ? req.params : req.query);
      next();
    } catch (error) {
      next(error);
    }
  };
}

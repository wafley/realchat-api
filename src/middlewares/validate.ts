import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'params' | 'query' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (source === 'body') {
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

// src/middlewares/validate.ts
import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../utils/errorHandler';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new AppError(error.errors[0].message, 400));
      }
      return next(error);
    }
  };
};
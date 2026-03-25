// src/middlewares/notFound.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errorHandler';

export const notfound = (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Route not found - ${req.originalUrl}`, 404));
};
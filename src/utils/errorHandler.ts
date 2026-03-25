// errorHandler.ts
import { Request, Response, NextFunction } from 'express';

// Define AppError right here in this file
export class AppError extends Error {
  statusCode: number;
  status: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (     
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  // Check if it's our custom AppError
  if (err instanceof AppError) {  
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,       
      status: err.status
    });
  }

  // Handle unknown errors        
  console.error(err.stack);       
  return res.status(500).json({ 
    success: false,
    message: 'Internal Server Error'
  });
};
import { Request, Response, NextFunction } from 'express';
export declare class AppError extends Error {
    statusCode: number;
    status: string;
    isOperational: boolean;
    constructor(message: string, statusCode: number);
}
export declare const errorHandler: (err: Error | AppError, _req: Request, res: Response, _next: NextFunction) => Response;
//# sourceMappingURL=errorHandler.d.ts.map
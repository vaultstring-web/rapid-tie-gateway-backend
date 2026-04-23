import { Request, Response, NextFunction } from 'express';
export declare const verifyWebhookSignature: (provider: string) => (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
//# sourceMappingURL=webhook.middleware.d.ts.map
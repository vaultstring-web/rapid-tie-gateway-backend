import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare class MerchantController {
    getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getAnalytics(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getTransactions(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getTransactionById(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getPaymentLinks(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    createPaymentLink(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    processRefund(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    listApiKeys(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    createApiKey(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    revokeApiKey(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    listWebhooks(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    createWebhook(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    updateWebhook(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    deleteWebhook(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getWebhookLogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getCheckoutSettings(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    updateCheckoutSettings(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getTeamMembers(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    inviteTeamMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
}
declare const _default: MerchantController;
export default _default;
//# sourceMappingURL=merchant.controller.d.ts.map
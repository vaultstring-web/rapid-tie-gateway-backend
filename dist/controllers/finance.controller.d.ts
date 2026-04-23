import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare class FinanceController {
    getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getBudgets(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getDisbursements(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getBatches(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getBatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    createBatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    processBatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    uploadBulkDisbursement(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
}
declare const _default: FinanceController;
export default _default;
//# sourceMappingURL=finance.controller.d.ts.map
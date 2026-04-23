import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare class ApproverController {
    getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getAllRequests(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getPending(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    processAction(action: 'approve' | 'reject'): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=approver.controller.d.ts.map
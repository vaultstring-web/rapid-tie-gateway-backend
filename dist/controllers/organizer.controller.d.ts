import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare class OrganizerController {
    getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    createEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    updateEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    static invalidateDashboardCache(userId: string): Promise<void>;
}
//# sourceMappingURL=organizer.controller.d.ts.map
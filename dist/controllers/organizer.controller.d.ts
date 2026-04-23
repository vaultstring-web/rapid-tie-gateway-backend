import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare class OrganizerController {
    private getOrganizer;
    getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getEvents(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    createEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    updateEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    deleteEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    static invalidateDashboardCache(userId: string): Promise<void>;
}
//# sourceMappingURL=organizer.controller.d.ts.map
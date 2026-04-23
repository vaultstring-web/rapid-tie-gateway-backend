import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare class EmployeeController {
    getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getMyRequests(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    createRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    cancelRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getDsaRates(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
}
declare const _default: EmployeeController;
export default _default;
//# sourceMappingURL=employee.controller.d.ts.map
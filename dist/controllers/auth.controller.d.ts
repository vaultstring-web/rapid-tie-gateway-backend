import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare class AuthController {
    register(req: Request, res: Response, next: NextFunction): Promise<void>;
    login(req: Request, res: Response, next: NextFunction): Promise<void>;
    refreshToken(req: Request, res: Response, next: NextFunction): Promise<void>;
    logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    me(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void>;
    resetPassword(req: Request, res: Response, next: NextFunction): Promise<void>;
    private logActivity;
    private generateToken;
    private generateRefreshToken;
}
//# sourceMappingURL=auth.controller.d.ts.map
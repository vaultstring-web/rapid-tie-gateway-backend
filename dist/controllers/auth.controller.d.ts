import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare class AuthController {
    register(req: Request, res: Response, next: NextFunction): Promise<void>;
    verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void>;
    validateResetToken(req: Request, res: Response, next: NextFunction): Promise<void>;
    login(req: Request, res: Response, next: NextFunction): Promise<void>;
    setup2FA(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    get2FAStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    enable2FA(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    disable2FA(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    verify2FA(req: Request, res: Response, next: NextFunction): Promise<void>;
    refreshToken(req: Request, res: Response, next: NextFunction): Promise<void>;
    logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    me(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void>;
    resetPassword(req: Request, res: Response, next: NextFunction): Promise<void>;
    private validatePasswordStrength;
    private logActivity;
    private generateToken;
    private generateRefreshToken;
    resendVerification(req: Request, res: Response, next: NextFunction): Promise<void>;
    verify2FABackupCode(req: Request, res: Response, next: NextFunction): Promise<void>;
    getTrustedDevices(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    revokeTrustedDevice(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    regenerateBackupCodes(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    request2FARecovery(req: Request, res: Response): Promise<void>;
    verify2FARecovery(req: Request, res: Response): Promise<void>;
    getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=auth.controller.d.ts.map
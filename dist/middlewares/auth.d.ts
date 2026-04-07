import { Request, Response, NextFunction } from 'express';
export type UserWithRelations = {
    id: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    phone?: string | null;
    lastLoginAt?: Date | null;
    passwordChangedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
    isActive?: boolean;
    isEmailVerified?: boolean;
    isPhoneVerified?: boolean;
    merchant?: any;
    organizer?: any;
    employee?: any;
    approver?: any;
    financeOfficer?: any;
    admin?: any;
};
export interface AuthRequest extends Request {
    user?: UserWithRelations;
    token?: string;
}
export declare const authenticate: (req: AuthRequest, _res: Response, next: NextFunction) => Promise<void>;
export declare const authorize: (...roles: string[]) => (req: AuthRequest, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map
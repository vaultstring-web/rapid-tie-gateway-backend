import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare const getUserCalendar: (req: AuthRequest, res: Response) => Promise<void>;
export declare const exportCalendar: (req: AuthRequest, res: Response) => Promise<void>;
export declare const sendEventReminders: (req: AuthRequest, res: Response) => Promise<void>;
export declare const clearCalendarCache: (_req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=calendar.controller.d.ts.map
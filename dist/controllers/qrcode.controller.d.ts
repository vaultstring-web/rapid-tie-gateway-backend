import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare const regenerateEventQRCodes: (req: AuthRequest, res: Response) => Promise<void>;
export declare const regenerateTicketQRCode: (req: AuthRequest, res: Response) => Promise<void>;
export declare const generateRoleSpecificQRCodes: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getDeliveryStatus: (req: AuthRequest, res: Response) => Promise<void>;
export declare const queueBulkEmails: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=qrcode.controller.d.ts.map
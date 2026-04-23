import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare const sendBulkMessage: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getCommunicationStatus: (req: AuthRequest, res: Response) => Promise<void>;
export declare const trackOpen: (req: AuthRequest, res: Response) => Promise<void>;
export declare const trackClick: (req: AuthRequest, res: Response) => Promise<void>;
export declare const optOut: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getEventCommunications: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=communication.controller.d.ts.map
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare const getNetworkingSuggestions: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateNetworkingProfile: (req: AuthRequest, res: Response) => Promise<void>;
export declare const sendConnectionRequest: (req: AuthRequest, res: Response) => Promise<void>;
export declare const respondToConnection: (req: AuthRequest, res: Response) => Promise<void>;
export declare const sendMessage: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getMessages: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getConnections: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=networking.controller.d.ts.map
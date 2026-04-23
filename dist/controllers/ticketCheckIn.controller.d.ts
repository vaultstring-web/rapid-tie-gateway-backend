import { Request, Response } from "express";
export declare const generateSignedQRCode: (ticketId: string) => {
    qrCode: string;
    signature: string;
};
export declare const checkInTicket: (req: Request, res: Response) => Promise<void>;
export declare const batchCheckIn: (req: Request, res: Response) => Promise<void>;
export declare const getCheckInStats: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=ticketCheckIn.controller.d.ts.map
export declare class QRCodeService {
    static generateSignature(data: string): string;
    static verifySignature(data: string, signature: string): boolean;
    static generateSignedQRCode(ticketId: string, role?: string): Promise<{
        qrCode: string;
        signature: string;
        qrImage: string;
    }>;
    static generateRoleSpecificQRCode(ticketId: string, role: string, permissions: string[]): Promise<{
        qrCode: string;
        signature: string;
        qrImage: string;
    }>;
    static decodeAndVerify(qrData: string): {
        isValid: boolean;
        data?: any;
        role?: string;
    };
    static regenerateQRCode(ticketId: string, role?: string): Promise<any>;
    static regenerateEventQRCodes(eventId: string, role?: string): Promise<{
        total: number;
        tickets: any[];
    }>;
}
export default QRCodeService;
//# sourceMappingURL=qrcode.service.d.ts.map
export interface SendEmailParams {
    email: string;
    token: string;
    type: 'VERIFICATION' | 'RESET' | 'RESET_CONFIRMATION';
    firstName?: string;
}
export interface TicketEmailParams {
    email: string;
    orderNumber: string;
    customerName: string;
    eventName: string;
    eventDate: Date;
    eventVenue: string;
    tickets: Array<{
        id: string;
        attendeeName: string;
        qrCode: string;
    }>;
    totalAmount: number;
}
export declare function sendVerificationEmail(email: string, token: string, type?: 'VERIFICATION' | 'RESET' | 'RESET_CONFIRMATION', firstName?: string): Promise<void>;
export declare function sendTicketConfirmationEmail(params: TicketEmailParams): Promise<void>;
//# sourceMappingURL=email.d.ts.map
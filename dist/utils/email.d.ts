export interface SendEmailParams {
    email: string;
    token: string;
    type: 'VERIFICATION' | 'RESET' | 'RESET_CONFIRMATION';
    firstName?: string;
}
export declare function sendVerificationEmail(email: string, token: string, type?: 'VERIFICATION' | 'RESET' | 'RESET_CONFIRMATION', firstName?: string): Promise<void>;
//# sourceMappingURL=email.d.ts.map
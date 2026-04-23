export declare const validateTicketsService: (tierId: string, quantity: number, purchaserRole?: string) => Promise<{
    sessionToken: string;
    expiresIn: string;
    tier: string;
    quantity: number;
    subtotal: number;
    fee: number;
    total: number;
    purchaserRole: string | undefined;
}>;
//# sourceMappingURL=tickets.service.d.ts.map
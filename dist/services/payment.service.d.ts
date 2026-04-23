export interface PaymentInitiateData {
    sessionToken: string;
    paymentMethod: string;
    provider?: string;
    customerPhone?: string;
}
export interface WebhookData {
    transactionRef: string;
    status: 'success' | 'failed' | 'pending';
    providerRef: string;
    amount: number;
    metadata?: Record<string, any>;
}
declare class PaymentService {
    private processAirtelMoney;
    private processMpamba;
    private processCard;
    initiatePayment(data: PaymentInitiateData): Promise<{
        success: boolean;
        transaction: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            merchantId: string | null;
            amount: number;
            fee: number;
            netAmount: number;
            organizerId: string | null;
            orderId: string | null;
            transactionRef: string;
            currency: string;
            paymentMethod: string;
            provider: string | null;
            providerRef: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        order: {
            id: string;
            createdAt: Date;
            status: string;
            eventId: string;
            netAmount: number;
            organizerId: string;
            paymentMethod: string;
            customerName: string;
            customerEmail: string;
            transactionId: string | null;
            orderNumber: string;
            customerPhone: string | null;
            totalAmount: number;
            feeAmount: number;
        } | null;
        paymentSession: {
            event: {
                organizer: {
                    id: string;
                    phone: string | null;
                    createdAt: Date;
                    updatedAt: Date;
                    userId: string;
                    website: string | null;
                    logo: string | null;
                    status: import("@prisma/client").$Enums.AccountStatus;
                    organizationName: string;
                    organizationRegNo: string | null;
                    organizationType: string | null;
                    contactPerson: string | null;
                };
            } & {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                country: string;
                city: string;
                status: import("@prisma/client").$Enums.EventStatus;
                type: string;
                amount: number;
                organizerId: string;
                description: string;
                shortDescription: string | null;
                category: string;
                venue: string;
                startDate: Date;
                endDate: Date;
                timezone: string;
                coverImage: string | null;
                images: import("@prisma/client/runtime/library").JsonValue | null;
                capacity: number | null;
                visibility: string;
            };
            tier: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                eventId: string;
                description: string | null;
                price: number;
                quantity: number;
                maxPerCustomer: number | null;
                startSale: Date | null;
                endSale: Date | null;
                rolePricing: import("@prisma/client/runtime/library").JsonValue | null;
                sold: number;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.PaymentStatus;
            expiresAt: Date;
            eventId: string;
            orderId: string | null;
            currency: string;
            paymentMethod: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            totalAmount: number;
            quantity: number;
            tierId: string;
            sessionToken: string;
            paymentRef: string | null;
        };
    }>;
    createPaymentSession(eventId: string, tierId: string, quantity: number, totalAmount: number, sessionToken: string, orderId?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.PaymentStatus;
        expiresAt: Date;
        eventId: string;
        orderId: string | null;
        currency: string;
        paymentMethod: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        totalAmount: number;
        quantity: number;
        tierId: string;
        sessionToken: string;
        paymentRef: string | null;
    }>;
    private releaseInventory;
    private removeInventoryLock;
    handleWebhook(webhookData: WebhookData): Promise<{
        success: boolean;
        transaction: {
            organizer: {
                id: string;
                phone: string | null;
                createdAt: Date;
                updatedAt: Date;
                userId: string;
                website: string | null;
                logo: string | null;
                status: import("@prisma/client").$Enums.AccountStatus;
                organizationName: string;
                organizationRegNo: string | null;
                organizationType: string | null;
                contactPerson: string | null;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            merchantId: string | null;
            amount: number;
            fee: number;
            netAmount: number;
            organizerId: string | null;
            orderId: string | null;
            transactionRef: string;
            currency: string;
            paymentMethod: string;
            provider: string | null;
            providerRef: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
    }>;
}
export declare const paymentService: PaymentService;
export {};
//# sourceMappingURL=payment.service.d.ts.map
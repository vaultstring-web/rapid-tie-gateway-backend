import { z } from 'zod';
export declare const analyticsSchema: z.ZodObject<{
    body: z.ZodObject<{
        startDate: z.ZodString;
        endDate: z.ZodString;
        status: z.ZodOptional<z.ZodString>;
        paymentMethod: z.ZodOptional<z.ZodString>;
        eventId: z.ZodOptional<z.ZodString>;
        exportCsv: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false"]>]>>;
    }, "strip", z.ZodTypeAny, {
        startDate: string;
        endDate: string;
        status?: string | undefined;
        paymentMethod?: string | undefined;
        eventId?: string | undefined;
        exportCsv?: boolean | "true" | "false" | undefined;
    }, {
        startDate: string;
        endDate: string;
        status?: string | undefined;
        paymentMethod?: string | undefined;
        eventId?: string | undefined;
        exportCsv?: boolean | "true" | "false" | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        startDate: string;
        endDate: string;
        status?: string | undefined;
        paymentMethod?: string | undefined;
        eventId?: string | undefined;
        exportCsv?: boolean | "true" | "false" | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}, {
    body: {
        startDate: string;
        endDate: string;
        status?: string | undefined;
        paymentMethod?: string | undefined;
        eventId?: string | undefined;
        exportCsv?: boolean | "true" | "false" | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}>;
export declare const transactionsQuerySchema: z.ZodObject<{
    query: z.ZodObject<{
        page: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
        paymentMethod: z.ZodOptional<z.ZodString>;
        startDate: z.ZodOptional<z.ZodString>;
        endDate: z.ZodOptional<z.ZodString>;
        minAmount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
        maxAmount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
        eventId: z.ZodOptional<z.ZodString>;
        search: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        startDate?: string | undefined;
        endDate?: string | undefined;
        status?: string | undefined;
        paymentMethod?: string | undefined;
        eventId?: string | undefined;
        page?: string | undefined;
        minAmount?: string | number | undefined;
        maxAmount?: string | number | undefined;
        search?: string | undefined;
    }, {
        startDate?: string | undefined;
        endDate?: string | undefined;
        status?: string | undefined;
        paymentMethod?: string | undefined;
        eventId?: string | undefined;
        page?: string | undefined;
        minAmount?: string | number | undefined;
        maxAmount?: string | number | undefined;
        search?: string | undefined;
    }>;
    body: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    query: {
        startDate?: string | undefined;
        endDate?: string | undefined;
        status?: string | undefined;
        paymentMethod?: string | undefined;
        eventId?: string | undefined;
        page?: string | undefined;
        minAmount?: string | number | undefined;
        maxAmount?: string | number | undefined;
        search?: string | undefined;
    };
    params?: {} | undefined;
    body?: {} | undefined;
}, {
    query: {
        startDate?: string | undefined;
        endDate?: string | undefined;
        status?: string | undefined;
        paymentMethod?: string | undefined;
        eventId?: string | undefined;
        page?: string | undefined;
        minAmount?: string | number | undefined;
        maxAmount?: string | number | undefined;
        search?: string | undefined;
    };
    params?: {} | undefined;
    body?: {} | undefined;
}>;
export declare const transactionParamsSchema: z.ZodObject<{
    params: z.ZodObject<{
        id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
    }, {
        id: string;
    }>;
    body: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    params: {
        id: string;
    };
    body?: {} | undefined;
    query?: {} | undefined;
}, {
    params: {
        id: string;
    };
    body?: {} | undefined;
    query?: {} | undefined;
}>;
export declare const paymentLinksQuerySchema: z.ZodObject<{
    query: z.ZodObject<{
        page: z.ZodOptional<z.ZodString>;
        eventId: z.ZodOptional<z.ZodString>;
        active: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
    }, "strip", z.ZodTypeAny, {
        eventId?: string | undefined;
        page?: string | undefined;
        active?: "true" | "false" | undefined;
    }, {
        eventId?: string | undefined;
        page?: string | undefined;
        active?: "true" | "false" | undefined;
    }>;
    body: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    query: {
        eventId?: string | undefined;
        page?: string | undefined;
        active?: "true" | "false" | undefined;
    };
    params?: {} | undefined;
    body?: {} | undefined;
}, {
    query: {
        eventId?: string | undefined;
        page?: string | undefined;
        active?: "true" | "false" | undefined;
    };
    params?: {} | undefined;
    body?: {} | undefined;
}>;
export declare const createPaymentLinkSchema: z.ZodObject<{
    body: z.ZodObject<{
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
        currency: z.ZodOptional<z.ZodString>;
        singleUse: z.ZodOptional<z.ZodBoolean>;
        expiresAt: z.ZodOptional<z.ZodString>;
        eventId: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        eventId?: string | undefined;
        description?: string | undefined;
        amount?: string | number | undefined;
        currency?: string | undefined;
        singleUse?: boolean | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, any> | undefined;
    }, {
        title: string;
        eventId?: string | undefined;
        description?: string | undefined;
        amount?: string | number | undefined;
        currency?: string | undefined;
        singleUse?: boolean | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, any> | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        title: string;
        eventId?: string | undefined;
        description?: string | undefined;
        amount?: string | number | undefined;
        currency?: string | undefined;
        singleUse?: boolean | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, any> | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}, {
    body: {
        title: string;
        eventId?: string | undefined;
        description?: string | undefined;
        amount?: string | number | undefined;
        currency?: string | undefined;
        singleUse?: boolean | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, any> | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}>;
export declare const refundSchema: z.ZodObject<{
    body: z.ZodObject<{
        transactionId: z.ZodString;
        amount: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
        reason: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        amount: string | number;
        transactionId: string;
        reason?: string | undefined;
    }, {
        amount: string | number;
        transactionId: string;
        reason?: string | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        amount: string | number;
        transactionId: string;
        reason?: string | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}, {
    body: {
        amount: string | number;
        transactionId: string;
        reason?: string | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}>;
export declare const createApiKeySchema: z.ZodObject<{
    body: z.ZodObject<{
        name: z.ZodString;
        permissions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        expiresAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        expiresAt?: string | undefined;
        permissions?: string[] | undefined;
    }, {
        name: string;
        expiresAt?: string | undefined;
        permissions?: string[] | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        name: string;
        expiresAt?: string | undefined;
        permissions?: string[] | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}, {
    body: {
        name: string;
        expiresAt?: string | undefined;
        permissions?: string[] | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}>;
export declare const apiKeyParamsSchema: z.ZodObject<{
    params: z.ZodObject<{
        id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
    }, {
        id: string;
    }>;
    body: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    params: {
        id: string;
    };
    body?: {} | undefined;
    query?: {} | undefined;
}, {
    params: {
        id: string;
    };
    body?: {} | undefined;
    query?: {} | undefined;
}>;
export declare const createWebhookSchema: z.ZodObject<{
    body: z.ZodObject<{
        url: z.ZodString;
        events: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        url: string;
        events: string[];
    }, {
        url: string;
        events: string[];
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        url: string;
        events: string[];
    };
    params?: {} | undefined;
    query?: {} | undefined;
}, {
    body: {
        url: string;
        events: string[];
    };
    params?: {} | undefined;
    query?: {} | undefined;
}>;
export declare const updateWebhookSchema: z.ZodObject<{
    params: z.ZodObject<{
        id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
    }, {
        id: string;
    }>;
    body: z.ZodObject<{
        url: z.ZodOptional<z.ZodString>;
        events: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        active: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        url?: string | undefined;
        active?: boolean | undefined;
        events?: string[] | undefined;
    }, {
        url?: string | undefined;
        active?: boolean | undefined;
        events?: string[] | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    params: {
        id: string;
    };
    body: {
        url?: string | undefined;
        active?: boolean | undefined;
        events?: string[] | undefined;
    };
    query?: {} | undefined;
}, {
    params: {
        id: string;
    };
    body: {
        url?: string | undefined;
        active?: boolean | undefined;
        events?: string[] | undefined;
    };
    query?: {} | undefined;
}>;
export declare const webhookLogsQuerySchema: z.ZodObject<{
    params: z.ZodObject<{
        id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
    }, {
        id: string;
    }>;
    query: z.ZodObject<{
        page: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        page?: string | undefined;
    }, {
        page?: string | undefined;
    }>;
    body: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    params: {
        id: string;
    };
    query: {
        page?: string | undefined;
    };
    body?: {} | undefined;
}, {
    params: {
        id: string;
    };
    query: {
        page?: string | undefined;
    };
    body?: {} | undefined;
}>;
export declare const checkoutSettingsSchema: z.ZodObject<{
    body: z.ZodObject<{
        checkoutBranding: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        paymentMethods: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        successUrl: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        cancelUrl: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    }, "strip", z.ZodTypeAny, {
        checkoutBranding?: Record<string, any> | undefined;
        paymentMethods?: Record<string, any> | undefined;
        successUrl?: string | undefined;
        cancelUrl?: string | undefined;
    }, {
        checkoutBranding?: Record<string, any> | undefined;
        paymentMethods?: Record<string, any> | undefined;
        successUrl?: string | undefined;
        cancelUrl?: string | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        checkoutBranding?: Record<string, any> | undefined;
        paymentMethods?: Record<string, any> | undefined;
        successUrl?: string | undefined;
        cancelUrl?: string | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}, {
    body: {
        checkoutBranding?: Record<string, any> | undefined;
        paymentMethods?: Record<string, any> | undefined;
        successUrl?: string | undefined;
        cancelUrl?: string | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}>;
export declare const inviteTeamSchema: z.ZodObject<{
    body: z.ZodObject<{
        email: z.ZodString;
        role: z.ZodEnum<["admin", "manager", "viewer", "support"]>;
        eventPermissions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        role: "admin" | "manager" | "viewer" | "support";
        email: string;
        eventPermissions?: string[] | undefined;
    }, {
        role: "admin" | "manager" | "viewer" | "support";
        email: string;
        eventPermissions?: string[] | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        role: "admin" | "manager" | "viewer" | "support";
        email: string;
        eventPermissions?: string[] | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}, {
    body: {
        role: "admin" | "manager" | "viewer" | "support";
        email: string;
        eventPermissions?: string[] | undefined;
    };
    params?: {} | undefined;
    query?: {} | undefined;
}>;
//# sourceMappingURL=merchant.validators.d.ts.map
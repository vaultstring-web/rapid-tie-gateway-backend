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
        eventId?: string | undefined;
        paymentMethod?: string | undefined;
        exportCsv?: boolean | "true" | "false" | undefined;
    }, {
        startDate: string;
        endDate: string;
        status?: string | undefined;
        eventId?: string | undefined;
        paymentMethod?: string | undefined;
        exportCsv?: boolean | "true" | "false" | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        startDate: string;
        endDate: string;
        status?: string | undefined;
        eventId?: string | undefined;
        paymentMethod?: string | undefined;
        exportCsv?: boolean | "true" | "false" | undefined;
    };
    query?: {} | undefined;
    params?: {} | undefined;
}, {
    body: {
        startDate: string;
        endDate: string;
        status?: string | undefined;
        eventId?: string | undefined;
        paymentMethod?: string | undefined;
        exportCsv?: boolean | "true" | "false" | undefined;
    };
    query?: {} | undefined;
    params?: {} | undefined;
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
        status?: string | undefined;
        maxAmount?: string | number | undefined;
        eventId?: string | undefined;
        paymentMethod?: string | undefined;
        startDate?: string | undefined;
        endDate?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
        minAmount?: string | number | undefined;
    }, {
        status?: string | undefined;
        maxAmount?: string | number | undefined;
        eventId?: string | undefined;
        paymentMethod?: string | undefined;
        startDate?: string | undefined;
        endDate?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
        minAmount?: string | number | undefined;
    }>;
    body: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    query: {
        status?: string | undefined;
        maxAmount?: string | number | undefined;
        eventId?: string | undefined;
        paymentMethod?: string | undefined;
        startDate?: string | undefined;
        endDate?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
        minAmount?: string | number | undefined;
    };
    params?: {} | undefined;
    body?: {} | undefined;
}, {
    query: {
        status?: string | undefined;
        maxAmount?: string | number | undefined;
        eventId?: string | undefined;
        paymentMethod?: string | undefined;
        startDate?: string | undefined;
        endDate?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
        minAmount?: string | number | undefined;
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
    query?: {} | undefined;
    body?: {} | undefined;
}, {
    params: {
        id: string;
    };
    query?: {} | undefined;
    body?: {} | undefined;
}>;
export declare const paymentLinksQuerySchema: z.ZodObject<{
    query: z.ZodObject<{
        page: z.ZodOptional<z.ZodString>;
        eventId: z.ZodOptional<z.ZodString>;
        active: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
    }, "strip", z.ZodTypeAny, {
        eventId?: string | undefined;
        active?: "true" | "false" | undefined;
        page?: string | undefined;
    }, {
        eventId?: string | undefined;
        active?: "true" | "false" | undefined;
        page?: string | undefined;
    }>;
    body: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    query: {
        eventId?: string | undefined;
        active?: "true" | "false" | undefined;
        page?: string | undefined;
    };
    params?: {} | undefined;
    body?: {} | undefined;
}, {
    query: {
        eventId?: string | undefined;
        active?: "true" | "false" | undefined;
        page?: string | undefined;
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
        expiresAt?: string | undefined;
        eventId?: string | undefined;
        amount?: string | number | undefined;
        currency?: string | undefined;
        metadata?: Record<string, any> | undefined;
        description?: string | undefined;
        singleUse?: boolean | undefined;
    }, {
        title: string;
        expiresAt?: string | undefined;
        eventId?: string | undefined;
        amount?: string | number | undefined;
        currency?: string | undefined;
        metadata?: Record<string, any> | undefined;
        description?: string | undefined;
        singleUse?: boolean | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        title: string;
        expiresAt?: string | undefined;
        eventId?: string | undefined;
        amount?: string | number | undefined;
        currency?: string | undefined;
        metadata?: Record<string, any> | undefined;
        description?: string | undefined;
        singleUse?: boolean | undefined;
    };
    query?: {} | undefined;
    params?: {} | undefined;
}, {
    body: {
        title: string;
        expiresAt?: string | undefined;
        eventId?: string | undefined;
        amount?: string | number | undefined;
        currency?: string | undefined;
        metadata?: Record<string, any> | undefined;
        description?: string | undefined;
        singleUse?: boolean | undefined;
    };
    query?: {} | undefined;
    params?: {} | undefined;
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
    query?: {} | undefined;
    params?: {} | undefined;
}, {
    body: {
        amount: string | number;
        transactionId: string;
        reason?: string | undefined;
    };
    query?: {} | undefined;
    params?: {} | undefined;
}>;
export declare const createApiKeySchema: z.ZodObject<{
    body: z.ZodObject<{
        name: z.ZodString;
        permissions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        expiresAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        permissions?: string[] | undefined;
        expiresAt?: string | undefined;
    }, {
        name: string;
        permissions?: string[] | undefined;
        expiresAt?: string | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        name: string;
        permissions?: string[] | undefined;
        expiresAt?: string | undefined;
    };
    query?: {} | undefined;
    params?: {} | undefined;
}, {
    body: {
        name: string;
        permissions?: string[] | undefined;
        expiresAt?: string | undefined;
    };
    query?: {} | undefined;
    params?: {} | undefined;
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
    query?: {} | undefined;
    body?: {} | undefined;
}, {
    params: {
        id: string;
    };
    query?: {} | undefined;
    body?: {} | undefined;
}>;
export declare const createWebhookSchema: z.ZodObject<{
    body: z.ZodObject<{
        url: z.ZodString;
        events: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        events: string[];
        url: string;
    }, {
        events: string[];
        url: string;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        events: string[];
        url: string;
    };
    query?: {} | undefined;
    params?: {} | undefined;
}, {
    body: {
        events: string[];
        url: string;
    };
    query?: {} | undefined;
    params?: {} | undefined;
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
        events?: string[] | undefined;
        url?: string | undefined;
        active?: boolean | undefined;
    }, {
        events?: string[] | undefined;
        url?: string | undefined;
        active?: boolean | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    params: {
        id: string;
    };
    body: {
        events?: string[] | undefined;
        url?: string | undefined;
        active?: boolean | undefined;
    };
    query?: {} | undefined;
}, {
    params: {
        id: string;
    };
    body: {
        events?: string[] | undefined;
        url?: string | undefined;
        active?: boolean | undefined;
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
    query: {
        page?: string | undefined;
    };
    params: {
        id: string;
    };
    body?: {} | undefined;
}, {
    query: {
        page?: string | undefined;
    };
    params: {
        id: string;
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
    query?: {} | undefined;
    params?: {} | undefined;
}, {
    body: {
        checkoutBranding?: Record<string, any> | undefined;
        paymentMethods?: Record<string, any> | undefined;
        successUrl?: string | undefined;
        cancelUrl?: string | undefined;
    };
    query?: {} | undefined;
    params?: {} | undefined;
}>;
export declare const inviteTeamSchema: z.ZodObject<{
    body: z.ZodObject<{
        email: z.ZodString;
        role: z.ZodEnum<["admin", "manager", "viewer", "support"]>;
        eventPermissions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        email: string;
        role: "admin" | "manager" | "viewer" | "support";
        eventPermissions?: string[] | undefined;
    }, {
        email: string;
        role: "admin" | "manager" | "viewer" | "support";
        eventPermissions?: string[] | undefined;
    }>;
    query: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    body: {
        email: string;
        role: "admin" | "manager" | "viewer" | "support";
        eventPermissions?: string[] | undefined;
    };
    query?: {} | undefined;
    params?: {} | undefined;
}, {
    body: {
        email: string;
        role: "admin" | "manager" | "viewer" | "support";
        eventPermissions?: string[] | undefined;
    };
    query?: {} | undefined;
    params?: {} | undefined;
}>;
//# sourceMappingURL=merchant.validators.d.ts.map
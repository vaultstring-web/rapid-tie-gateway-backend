import { z } from 'zod';
export declare const requestListQuerySchema: z.ZodObject<{
    query: z.ZodObject<{
        page: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
        search: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    }, {
        status?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    query: {
        status?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    };
}, {
    query: {
        status?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    };
}>;
export declare const createDsaRequestSchema: z.ZodObject<{
    body: z.ZodEffects<z.ZodObject<{
        destination: z.ZodString;
        purpose: z.ZodString;
        startDate: z.ZodEffects<z.ZodString, string, string>;
        endDate: z.ZodEffects<z.ZodString, string, string>;
        notes: z.ZodOptional<z.ZodString>;
        travelAuthRef: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        startDate: string;
        endDate: string;
        destination: string;
        purpose: string;
        travelAuthRef?: string | undefined;
        notes?: string | undefined;
    }, {
        startDate: string;
        endDate: string;
        destination: string;
        purpose: string;
        travelAuthRef?: string | undefined;
        notes?: string | undefined;
    }>, {
        startDate: string;
        endDate: string;
        destination: string;
        purpose: string;
        travelAuthRef?: string | undefined;
        notes?: string | undefined;
    }, {
        startDate: string;
        endDate: string;
        destination: string;
        purpose: string;
        travelAuthRef?: string | undefined;
        notes?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    body: {
        startDate: string;
        endDate: string;
        destination: string;
        purpose: string;
        travelAuthRef?: string | undefined;
        notes?: string | undefined;
    };
}, {
    body: {
        startDate: string;
        endDate: string;
        destination: string;
        purpose: string;
        travelAuthRef?: string | undefined;
        notes?: string | undefined;
    };
}>;
export declare const updateProfileSchema: z.ZodObject<{
    body: z.ZodObject<{
        firstName: z.ZodOptional<z.ZodString>;
        lastName: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
        profileImage: z.ZodOptional<z.ZodString>;
        bankAccount: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        mobileMoney: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        profileImage?: string | undefined;
        bankAccount?: Record<string, any> | undefined;
        mobileMoney?: Record<string, any> | undefined;
    }, {
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        profileImage?: string | undefined;
        bankAccount?: Record<string, any> | undefined;
        mobileMoney?: Record<string, any> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    body: {
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        profileImage?: string | undefined;
        bankAccount?: Record<string, any> | undefined;
        mobileMoney?: Record<string, any> | undefined;
    };
}, {
    body: {
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        profileImage?: string | undefined;
        bankAccount?: Record<string, any> | undefined;
        mobileMoney?: Record<string, any> | undefined;
    };
}>;
//# sourceMappingURL=employee.validators.d.ts.map
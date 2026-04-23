import { z } from 'zod';
export declare const pendingApprovalsQuerySchema: z.ZodObject<{
    query: z.ZodObject<{
        department: z.ZodOptional<z.ZodString>;
        startDate: z.ZodOptional<z.ZodString>;
        endDate: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        department?: string | undefined;
        startDate?: string | undefined;
        endDate?: string | undefined;
    }, {
        department?: string | undefined;
        startDate?: string | undefined;
        endDate?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    query: {
        department?: string | undefined;
        startDate?: string | undefined;
        endDate?: string | undefined;
    };
}, {
    query: {
        department?: string | undefined;
        startDate?: string | undefined;
        endDate?: string | undefined;
    };
}>;
export declare const requestsQuerySchema: z.ZodObject<{
    query: z.ZodObject<{
        page: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
        search: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
    }, {
        status?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    query: {
        status?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
    };
}, {
    query: {
        status?: string | undefined;
        search?: string | undefined;
        page?: string | undefined;
    };
}>;
//# sourceMappingURL=approver.validators.d.ts.map
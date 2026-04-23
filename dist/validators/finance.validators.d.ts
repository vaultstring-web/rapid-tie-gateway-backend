import { z } from 'zod';
export declare const budgetsQuerySchema: z.ZodObject<{
    query: z.ZodObject<{
        fiscalYear: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        fiscalYear?: string | undefined;
    }, {
        fiscalYear?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    query: {
        fiscalYear?: string | undefined;
    };
}, {
    query: {
        fiscalYear?: string | undefined;
    };
}>;
export declare const disbursementReadyQuerySchema: z.ZodObject<{
    query: z.ZodObject<{
        page: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodString>;
        search: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        search?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    }, {
        search?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    query: {
        search?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    };
}, {
    query: {
        search?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    };
}>;
export declare const batchesQuerySchema: z.ZodObject<{
    query: z.ZodObject<{
        page: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    }, {
        status?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    query: {
        status?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    };
}, {
    query: {
        status?: string | undefined;
        page?: string | undefined;
        limit?: string | undefined;
    };
}>;
export declare const createBatchSchema: z.ZodObject<{
    body: z.ZodObject<{
        requestIds: z.ZodArray<z.ZodString, "many">;
        notes: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        requestIds: string[];
        notes?: string | undefined;
    }, {
        requestIds: string[];
        notes?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    body: {
        requestIds: string[];
        notes?: string | undefined;
    };
}, {
    body: {
        requestIds: string[];
        notes?: string | undefined;
    };
}>;
export declare const bulkDisbursementUploadSchema: z.ZodObject<{
    body: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
}, "strip", z.ZodTypeAny, {
    body: {} & {
        [k: string]: unknown;
    };
}, {
    body: {} & {
        [k: string]: unknown;
    };
}>;
export declare const processBatchSchema: z.ZodObject<{
    body: z.ZodObject<{
        status: z.ZodEnum<["processing", "completed", "failed"]>;
    }, "strip", z.ZodTypeAny, {
        status: "completed" | "processing" | "failed";
    }, {
        status: "completed" | "processing" | "failed";
    }>;
    params: z.ZodObject<{
        id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
    }, {
        id: string;
    }>;
}, "strip", z.ZodTypeAny, {
    params: {
        id: string;
    };
    body: {
        status: "completed" | "processing" | "failed";
    };
}, {
    params: {
        id: string;
    };
    body: {
        status: "completed" | "processing" | "failed";
    };
}>;
export declare const updateProfileSchema: z.ZodObject<{
    body: z.ZodObject<{
        firstName: z.ZodOptional<z.ZodString>;
        lastName: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
        profileImage: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        profileImage?: string | undefined;
    }, {
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        profileImage?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    body: {
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        profileImage?: string | undefined;
    };
}, {
    body: {
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        profileImage?: string | undefined;
    };
}>;
//# sourceMappingURL=finance.validators.d.ts.map
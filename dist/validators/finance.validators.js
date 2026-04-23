"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfileSchema = exports.processBatchSchema = exports.bulkDisbursementUploadSchema = exports.createBatchSchema = exports.batchesQuerySchema = exports.disbursementReadyQuerySchema = exports.budgetsQuerySchema = void 0;
const zod_1 = require("zod");
exports.budgetsQuerySchema = zod_1.z.object({
    query: zod_1.z.object({
        fiscalYear: zod_1.z.string().trim().optional(),
    }),
});
exports.disbursementReadyQuerySchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional(),
        limit: zod_1.z.string().optional(),
        search: zod_1.z.string().trim().optional(),
    }),
});
exports.batchesQuerySchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional(),
        limit: zod_1.z.string().optional(),
        status: zod_1.z.string().trim().optional(),
    }),
});
exports.createBatchSchema = zod_1.z.object({
    body: zod_1.z.object({
        requestIds: zod_1.z
            .array(zod_1.z.string().cuid({ message: 'Each requestId must be a valid CUID' }))
            .min(1, 'At least one requestId is required'),
        notes: zod_1.z.string().optional(),
    }),
});
exports.bulkDisbursementUploadSchema = zod_1.z.object({
    body: zod_1.z.object({}).passthrough(),
});
exports.processBatchSchema = zod_1.z.object({
    body: zod_1.z.object({
        status: zod_1.z.enum(['processing', 'completed', 'failed'], {
            errorMap: () => ({ message: 'status must be one of: processing, completed, failed' }),
        }),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Batch id is required'),
    }),
});
exports.updateProfileSchema = zod_1.z.object({
    body: zod_1.z.object({
        firstName: zod_1.z.string().trim().min(1).optional(),
        lastName: zod_1.z.string().trim().min(1).optional(),
        phone: zod_1.z.string().trim().optional(),
        profileImage: zod_1.z.string().url().optional(),
    }),
});
//# sourceMappingURL=finance.validators.js.map
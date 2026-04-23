"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfileSchema = exports.createDsaRequestSchema = exports.requestListQuerySchema = void 0;
const zod_1 = require("zod");
exports.requestListQuerySchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional(),
        limit: zod_1.z.string().optional(),
        status: zod_1.z.string().trim().optional(),
        search: zod_1.z.string().trim().optional(),
    }),
});
exports.createDsaRequestSchema = zod_1.z.object({
    body: zod_1.z.object({
        destination: zod_1.z.string().trim().min(1, 'destination is required'),
        purpose: zod_1.z.string().trim().min(1, 'purpose is required'),
        startDate: zod_1.z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid startDate'),
        endDate: zod_1.z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid endDate'),
        notes: zod_1.z.string().optional(),
        travelAuthRef: zod_1.z.string().optional(),
    }).refine((data) => new Date(data.startDate) <= new Date(data.endDate), { message: 'startDate cannot be after endDate', path: ['endDate'] }),
});
exports.updateProfileSchema = zod_1.z.object({
    body: zod_1.z.object({
        firstName: zod_1.z.string().trim().min(1).optional(),
        lastName: zod_1.z.string().trim().min(1).optional(),
        phone: zod_1.z.string().trim().optional(),
        profileImage: zod_1.z.string().url().optional(),
        bankAccount: zod_1.z.record(zod_1.z.any()).optional(),
        mobileMoney: zod_1.z.record(zod_1.z.any()).optional(),
    }),
});
//# sourceMappingURL=employee.validators.js.map
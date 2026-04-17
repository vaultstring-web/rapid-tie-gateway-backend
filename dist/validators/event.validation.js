"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEventSchema = void 0;
const zod_1 = require("zod");
exports.updateEventSchema = zod_1.z.object({
    name: zod_1.z.string().min(3).optional(),
    description: zod_1.z.string().min(10).optional(),
    shortDescription: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
    type: zod_1.z.string().optional(),
    venue: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    country: zod_1.z.string().optional(),
    amount: zod_1.z.number().min(0).optional(),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
    timezone: zod_1.z.string().optional(),
    capacity: zod_1.z.number().int().min(0).optional(),
    coverImage: zod_1.z.string().url().optional(),
    images: zod_1.z.any().optional(),
    visibility: zod_1.z.enum(['public', 'merchant-only', 'all-platform']).optional(),
    status: zod_1.z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']).optional()
});
//# sourceMappingURL=event.validation.js.map
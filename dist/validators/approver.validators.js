"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestsQuerySchema = exports.pendingApprovalsQuerySchema = void 0;
const zod_1 = require("zod");
exports.pendingApprovalsQuerySchema = zod_1.z.object({
    query: zod_1.z.object({
        department: zod_1.z.string().trim().optional(),
        startDate: zod_1.z.string().optional(),
        endDate: zod_1.z.string().optional(),
    }),
});
exports.requestsQuerySchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional(),
        status: zod_1.z.string().trim().optional(),
        search: zod_1.z.string().trim().optional(),
    }),
});
//# sourceMappingURL=approver.validators.js.map
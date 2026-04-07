"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const zod_1 = require("zod");
const errorHandler_1 = require("../utils/errorHandler");
const validate = (schema) => {
    return async (req, _res, next) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params
            });
            return next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                return next(new errorHandler_1.AppError(error.errors[0].message, 400));
            }
            return next(error);
        }
    };
};
exports.validate = validate;
//# sourceMappingURL=validate.js.map
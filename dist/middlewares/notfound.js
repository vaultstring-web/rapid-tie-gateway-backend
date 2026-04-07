"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notfound = void 0;
const errorHandler_1 = require("../utils/errorHandler");
const notfound = (req, _res, next) => {
    next(new errorHandler_1.AppError(`Route not found - ${req.originalUrl}`, 404));
};
exports.notfound = notfound;
//# sourceMappingURL=notfound.js.map
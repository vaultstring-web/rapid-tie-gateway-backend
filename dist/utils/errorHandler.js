"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.AppError = void 0;
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
exports.AppError = AppError;
const errorHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            status: err.status
        });
    }
    console.error(err.stack);
    return res.status(500).json({
        success: false,
        message: 'Internal Server Error'
    });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=errorHandler.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logger = {
    info: (message) => console.log(`[INFO] ${message}`),
    error: (message, error) => {
        console.error(`[ERROR] ${message}`);
        if (error) {
            console.error(error);
        }
    },
    warn: (message) => console.warn(`[WARN] ${message}`),
    debug: (message) => console.debug(`[DEBUG] ${message}`),
};
//# sourceMappingURL=logger.js.map
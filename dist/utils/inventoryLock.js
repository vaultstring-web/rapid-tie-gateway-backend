"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeLock = exports.getLock = exports.createLock = void 0;
const inventoryLocks = new Map();
const createLock = (sessionToken, data) => {
    inventoryLocks.set(sessionToken, data);
};
exports.createLock = createLock;
const getLock = (sessionToken) => {
    return inventoryLocks.get(sessionToken);
};
exports.getLock = getLock;
const removeLock = (sessionToken) => {
    inventoryLocks.delete(sessionToken);
};
exports.removeLock = removeLock;
//# sourceMappingURL=inventoryLock.js.map
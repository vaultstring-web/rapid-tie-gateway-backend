"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const merchant_routes_1 = __importDefault(require("./routes/merchant.routes"));
const app = (0, express_1.default)();
const port = 3001;
app.use('/api/merchant', merchant_routes_1.default);
app.get('/health', (_req, res) => {
    res.json({ status: 'OK', message: 'Test server working!' });
});
app.listen(port, () => {
    console.log(`✅ Test server running at http://localhost:${port}`);
});
//# sourceMappingURL=test-server.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWebhookSignature = void 0;
const crypto_1 = __importDefault(require("crypto"));
const verifyWebhookSignature = (provider) => {
    return (req, res, next) => {
        const signature = req.headers['x-signature'] || req.headers['webhook-signature'];
        if (!signature) {
            return res.status(401).json({ error: 'No signature provided' });
        }
        let isValid = false;
        switch (provider) {
            case 'airtel':
                isValid = verifyAirtelSignature(req.body, signature);
                break;
            case 'mpamba':
                isValid = verifyMpambaSignature(req.body, signature);
                break;
            default:
                isValid = false;
        }
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        return next();
    };
};
exports.verifyWebhookSignature = verifyWebhookSignature;
function verifyAirtelSignature(payload, signature) {
    const secret = process.env.AIRTEL_WEBHOOK_SECRET || '';
    const expectedSignature = crypto_1.default
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
    return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
function verifyMpambaSignature(payload, signature) {
    const secret = process.env.MPAMBA_WEBHOOK_SECRET || '';
    const expectedSignature = crypto_1.default
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
    return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
//# sourceMappingURL=webhook.middleware.js.map
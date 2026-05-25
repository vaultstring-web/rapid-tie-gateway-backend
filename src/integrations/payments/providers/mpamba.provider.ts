import crypto from 'crypto';
import { PaymentProvider, ProviderInitiateInput, ProviderInitiateResult } from '../paymentProvider';

function hmacSha256Hex(secret: string, payload: Buffer): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function safeTimingEqualHex(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length) return false;
  if (!/^[0-9a-fA-F]+$/.test(aHex) || !/^[0-9a-fA-F]+$/.test(bHex)) return false;
  return crypto.timingSafeEqual(Buffer.from(aHex, 'hex'), Buffer.from(bHex, 'hex'));
}

export const mpambaProvider: PaymentProvider = {
  id: 'mpamba',

  async initiate(input: ProviderInitiateInput): Promise<ProviderInitiateResult> {
    const { customerPhone, amount, transactionRef } = input;
    if (!customerPhone) throw new Error('Phone number required for Mpamba');
    console.log(`Processing Mpamba: ${customerPhone}, ${amount}, ${transactionRef}`);
    return { success: true, providerRef: `MP-${Date.now()}` };
  },

  verifyWebhookSignature(rawBody: Buffer, signatureHex: string): boolean {
    const secret = process.env.MPAMBA_WEBHOOK_SECRET || '';
    if (!secret) return false;
    const expected = hmacSha256Hex(secret, rawBody);
    return safeTimingEqualHex(signatureHex, expected);
  },
};


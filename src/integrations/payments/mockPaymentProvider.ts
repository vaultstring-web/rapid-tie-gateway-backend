import { v4 as uuidv4 } from 'uuid';
import { PaymentProvider, ProviderInitiateInput, ProviderInitiateResult, ProviderRefundInput, ProviderRefundResult } from './paymentProvider';

export const mockPaymentProvider: PaymentProvider = {
  id: 'mock',

  async initiate(_input: ProviderInitiateInput): Promise<ProviderInitiateResult> {
    return { success: true, providerRef: `MOCK-${uuidv4()}` };
  },

  async refund(_input: ProviderRefundInput): Promise<ProviderRefundResult> {
    return { success: true };
  },

  verifyWebhookSignature(_rawBody: Buffer, _signatureHex: string): boolean {
    return true;
  },
};


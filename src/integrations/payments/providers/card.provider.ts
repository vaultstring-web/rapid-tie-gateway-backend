import { PaymentProvider, ProviderInitiateInput, ProviderInitiateResult } from '../paymentProvider';

export const cardProvider: PaymentProvider = {
  id: 'card',

  async initiate(input: ProviderInitiateInput): Promise<ProviderInitiateResult> {
    const { amount, transactionRef } = input;
    console.log(`Processing Card: ${amount}, ${transactionRef}`);
    return { success: true, providerRef: `CARD-${Date.now()}` };
  },
};


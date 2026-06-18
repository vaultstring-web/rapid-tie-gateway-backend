// src/integrations/payments/providers/card.provider.ts
import { PaymentProvider, ProviderInitiateInput, ProviderInitiateResult } from '../paymentProvider';

export const cardProvider: PaymentProvider = {
  id: 'card',

  async initiate(input: ProviderInitiateInput): Promise<ProviderInitiateResult> {
    const { amount, transactionRef, token } = input;
    
    const cardPaymentsEnabled = process.env.CARD_PAYMENTS_ENABLED === 'true';
    const isProduction = process.env.NODE_ENV === 'production';
    
    // 🔒 BLOCK in production unless explicitly enabled
    if (isProduction && !cardPaymentsEnabled) {
      throw new Error(
        'Card payments are not enabled in production. ' +
        'Set CARD_PAYMENTS_ENABLED=true after completing Stripe integration.'
      );
    }
    
    // 🔒 Require token in production (no raw card numbers)
    if (isProduction && !token) {
      throw new Error(
        'Card payment token is required. Please use Stripe.js to tokenize card details.'
      );
    }
    
    // Development mock implementation (no token required)
    if (!isProduction) {
      console.log(`🔧 [DEV] Mock Card payment: ${amount}, ${transactionRef}`);
      return { success: true, providerRef: `CARD-MOCK-${Date.now()}` };
    }
    
    // Production with real Stripe integration (when enabled)
    //if (cardPaymentsEnabled) {
      // Dynamic import to avoid loading Stripe in development
      //const { stripeProvider } = await import('./stripe.provider');
      //return stripeProvider.initiate(input);
    //}
    
    throw new Error( 'Card payment integration is in progress. ' +
                    'Please use Airtel Money or MPamba for now.');
  },
};
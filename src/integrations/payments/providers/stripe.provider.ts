// src/integrations/payments/providers/stripe.provider.ts
import { PaymentProvider, ProviderInitiateInput, ProviderInitiateResult } from '../paymentProvider';
import Stripe from 'stripe';

export const stripeProvider: PaymentProvider = {
  id: 'stripe',

  async initiate(input: ProviderInitiateInput): Promise<ProviderInitiateResult> {
    const { amount, currency, transactionRef, metadata, token } = input;
    
    const cardPaymentsEnabled = process.env.CARD_PAYMENTS_ENABLED === 'true';
    
    if (!cardPaymentsEnabled) {
      throw new Error('Card payments are not yet enabled. Set CARD_PAYMENTS_ENABLED=true when ready.');
    }
    
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is required for card payments');
    }
    
    // Simple initialization - no version issues
    const stripe = new Stripe(stripeSecretKey);
    
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        payment_method: token,
        confirmation_method: 'manual',
        confirm: true,
        metadata: {
          transactionRef,
          sessionToken: metadata?.sessionToken || '',
        },
      });
      
      if (paymentIntent.status === 'succeeded') {
        return {
          success: true,
          providerRef: paymentIntent.id,
        };
      } else if (paymentIntent.status === 'requires_action') {
        return {
          success: false,
          providerRef: paymentIntent.id,
          requiresAction: true,
          clientSecret: paymentIntent.client_secret || undefined,
        };
      } else {
        return {
          success: false,
          providerRef: paymentIntent.id,
          error: `Payment intent status: ${paymentIntent.status}`,
        };
      }
    } catch (error) {
      console.error('Stripe payment error:', error);
      return {
        success: false,
        providerRef: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};
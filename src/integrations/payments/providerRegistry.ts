import { PaymentProvider } from './paymentProvider';
import { airtelProvider } from './providers/airtel.provider';
import { mpambaProvider } from './providers/mpamba.provider';
import { cardProvider } from './providers/card.provider';

const providers: Record<string, PaymentProvider> = {
  airtel: airtelProvider,
  mpamba: mpambaProvider,
  card: cardProvider,
};

function normalize(input: string): string {
  return String(input || '').trim().toLowerCase();
}

export function resolveProvider(params: { paymentMethod?: string; provider?: string }): PaymentProvider {
  const explicit = normalize(params.provider || '');
  if (explicit && providers[explicit]) return providers[explicit];

  const method = normalize(params.paymentMethod || '');

  // Map current API paymentMethod values to provider ids.
  if (method === 'airtel_money') return providers.airtel;
  if (method === 'mpamba') return providers.mpamba;
  if (method === 'card') return providers.card;

  if (providers[method]) return providers[method];
  throw new Error(`Unsupported payment method/provider: ${params.paymentMethod || params.provider}`);
}

export function getProviderById(providerId: string): PaymentProvider | null {
  return providers[normalize(providerId)] || null;
}


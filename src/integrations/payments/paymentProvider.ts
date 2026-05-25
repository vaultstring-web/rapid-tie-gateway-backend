export interface ProviderInitiateInput {
  amount: number;
  currency: string;
  transactionRef: string;
  customerPhone?: string;
  metadata?: Record<string, any>;
}

export interface ProviderInitiateResult {
  success: boolean;
  providerRef: string;
  raw?: any;
}

export interface ProviderRefundInput {
  providerRef?: string | null;
  transactionRef: string;
  amount: number;
  currency: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface ProviderRefundResult {
  success: boolean;
  providerRef?: string;
  raw?: any;
}

export interface PaymentProvider {
  id: string;
  initiate(input: ProviderInitiateInput): Promise<ProviderInitiateResult>;
  refund?(input: ProviderRefundInput): Promise<ProviderRefundResult>;
  verifyWebhookSignature?(rawBody: Buffer, signatureHex: string): boolean;
}


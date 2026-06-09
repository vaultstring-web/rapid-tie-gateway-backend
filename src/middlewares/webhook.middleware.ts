import { Request, Response, NextFunction } from 'express';
import { getProviderById } from '../integrations/payments/providerRegistry';

type SupportedProvider = 'airtel' | 'mpamba';

function parseSignatureHeader(signatureHeader: unknown): string | null {
  if (!signatureHeader) return null;
  const raw = Array.isArray(signatureHeader) ? signatureHeader[0] : String(signatureHeader);
  // Common format: "sha256=<hex>"
  return raw.startsWith('sha256=') ? raw.slice('sha256='.length) : raw;
}

function verifyProviderSignature(provider: SupportedProvider, rawBody: Buffer, signatureHex: string): boolean {
  const providerImpl = getProviderById(provider);
  if (!providerImpl?.verifyWebhookSignature) return false;
  return providerImpl.verifyWebhookSignature(rawBody, signatureHex);
}

export const verifyWebhookSignature = (provider: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const signatureHeader = req.headers['x-signature'] || req.headers['webhook-signature'];
    
    const signatureHex = parseSignatureHeader(signatureHeader);
    if (!signatureHex) {
      return res.status(401).json({ error: 'No signature provided' });
    }

    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ error: 'Missing raw body for signature verification' });
    }

    const normalizedProvider = String(provider || '').toLowerCase();
    if (normalizedProvider !== 'airtel' && normalizedProvider !== 'mpamba') {
      return res.status(400).json({ error: 'Unsupported provider' });
    }

    const isValid = verifyProviderSignature(normalizedProvider as SupportedProvider, rawBody, signatureHex);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    return next();
  };
};
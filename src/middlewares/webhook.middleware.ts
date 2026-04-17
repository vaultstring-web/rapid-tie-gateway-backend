import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const verifyWebhookSignature = (provider: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['x-signature'] || req.headers['webhook-signature'];
    
    if (!signature) {
      return res.status(401).json({ error: 'No signature provided' });
    }

    // Different verification for different providers
    let isValid = false;
    
    switch (provider) {
      case 'airtel':
        // Airtel-specific verification
        isValid = verifyAirtelSignature(req.body, signature as string);
        break;
      case 'mpamba':
        // Mpamba-specific verification
        isValid = verifyMpambaSignature(req.body, signature as string);
        break;
      default:
        isValid = false;
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
  };
};

function verifyAirtelSignature(payload: any, signature: string): boolean {
  // Implement Airtel signature verification
  const secret = process.env.AIRTEL_WEBHOOK_SECRET || '';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

function verifyMpambaSignature(payload: any, signature: string): boolean {
  // Implement Mpamba signature verification
  const secret = process.env.MPAMBA_WEBHOOK_SECRET || '';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
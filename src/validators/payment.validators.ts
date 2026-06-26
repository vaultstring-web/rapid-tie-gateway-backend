import { z } from 'zod';

// Payment method enum
const PAYMENT_METHODS = ['airtel_money', 'mpamba', 'card', 'stripe'] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

// Session token format: alphanumeric with hyphens (UUID format or similar)
const sessionTokenRegex = /^[a-zA-Z0-9-]+$/;

/**
 * Schema for POST /api/payments/initiate
 */
export const initiatePaymentSchema = z.object({
  body: z.object({
    sessionToken: z
      .string()
      .min(8, 'Session token must be at least 8 characters')
      .max(255, 'Session token must not exceed 255 characters')
      .regex(sessionTokenRegex, 'Session token contains invalid characters'),
    
    paymentMethod: z
      .string()
      .min(1, 'Payment method is required')
      .refine(
        (val) => PAYMENT_METHODS.includes(val as PaymentMethod),
        `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}`
      ),
    
    provider: z
      .string()
      .optional()
      .nullable(),
    
    customerPhone: z
      .string()
      .optional()
      .nullable()
      .refine(
        (val) => !val || /^\+?[0-9]{8,15}$/.test(val),
        'Customer phone must be a valid phone number (8-15 digits, optional + prefix)'
      ),
    
    token: z
      .string()
      .optional()
      .nullable()
      .refine(
        (val) => !val || val.length > 0,
        'Token cannot be empty if provided'
      ),
  }),
});

/**
 * Schema for POST /api/payments/webhook/:provider
 */
export const webhookSchema = z.object({
  body: z.object({
    transactionRef: z
      .string()
      .min(3, 'Transaction reference must be at least 3 characters')
      .max(100, 'Transaction reference must not exceed 100 characters'),
    
    status: z
      .enum(['success', 'failed', 'pending'], {
        errorMap: () => ({ message: 'Status must be: success, failed, or pending' }),
      }),
    
    providerRef: z
      .string()
      .optional()
      .nullable(),
    
    amount: z
      .number({
        required_error: 'Amount is required',
        invalid_type_error: 'Amount must be a number',
      })
      .positive('Amount must be a positive number')
      .max(999999999.99, 'Amount exceeds maximum allowed value'),
    
    currency: z
      .string()
      .optional()
      .default('MWK')
      .refine(
        (val) => /^[A-Z]{3}$/.test(val),
        'Currency must be a 3-letter ISO currency code'
      ),
    
    metadata: z
      .record(z.any())
      .optional()
      .nullable(),
  }),
});

/**
 * Schema for GET /api/payments/status/:sessionToken
 */
export const getPaymentStatusSchema = z.object({
  params: z.object({
    sessionToken: z
      .string()
      .min(8, 'Session token must be at least 8 characters')
      .max(255, 'Session token must not exceed 255 characters')
      .regex(sessionTokenRegex, 'Session token contains invalid characters'),
  }),
});

// Export types for use in controllers
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>['body'];
export type WebhookInput = z.infer<typeof webhookSchema>['body'];
export type GetPaymentStatusInput = z.infer<typeof getPaymentStatusSchema>['params'];
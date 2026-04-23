// src/validators/finance.validators.ts
import { z } from 'zod';

export const budgetsQuerySchema = z.object({
  query: z.object({
    fiscalYear: z.string().trim().optional(),
  }),
});

export const disbursementReadyQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().trim().optional(),
  }),
});

export const batchesQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.string().trim().optional(),
  }),
});

export const createBatchSchema = z.object({
  body: z.object({
    requestIds: z
      .array(z.string().cuid({ message: 'Each requestId must be a valid CUID' }))
      .min(1, 'At least one requestId is required'),
    notes: z.string().optional(),
  }),
});

export const bulkDisbursementUploadSchema = z.object({
  body: z.object({}).passthrough(),
});

export const processBatchSchema = z.object({
  body: z.object({
    status: z.enum(['processing', 'completed', 'failed'], {
      errorMap: () => ({ message: 'status must be one of: processing, completed, failed' }),
    }),
  }),
  params: z.object({
    id: z.string().min(1, 'Batch id is required'),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    phone: z.string().trim().optional(),
    profileImage: z.string().url().optional(),
  }),
});

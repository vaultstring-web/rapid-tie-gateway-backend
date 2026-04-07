import { z } from 'zod';

export const updateEventSchema = z.object({
  name: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  shortDescription: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  venue: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  amount: z.number().min(0).optional(),

  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),

  timezone: z.string().optional(),
  capacity: z.number().int().min(0).optional(),

  coverImage: z.string().url().optional(),
  images: z.any().optional(),

  visibility: z.enum(['public', 'merchant-only', 'all-platform']).optional(),

  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']).optional()
});
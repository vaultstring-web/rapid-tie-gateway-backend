// src/validators/employee.validators.ts
import { z } from 'zod';

export const requestListQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.string().trim().optional(),
    search: z.string().trim().optional(),
  }),
});

export const createDsaRequestSchema = z.object({
  body: z.object({
    destination: z.string().trim().min(1, 'destination is required'),
    purpose: z.string().trim().min(1, 'purpose is required'),
    startDate: z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid startDate'),
    endDate: z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid endDate'),
    notes: z.string().optional(),
    travelAuthRef: z.string().optional(),
  }).refine(
    (data) => new Date(data.startDate) <= new Date(data.endDate),
    { message: 'startDate cannot be after endDate', path: ['endDate'] }
  ),
});

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    phone: z.string().trim().optional(),
    profileImage: z.string().url().optional(),
    bankAccount: z.record(z.any()).optional(),
    mobileMoney: z.record(z.any()).optional(),
  }),
});

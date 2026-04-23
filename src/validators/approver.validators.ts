import { z } from 'zod';

export const pendingApprovalsQuerySchema = z.object({
  query: z.object({
    department: z.string().trim().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

export const requestsQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    status: z.string().trim().optional(),
    search: z.string().trim().optional(),
  }),
});

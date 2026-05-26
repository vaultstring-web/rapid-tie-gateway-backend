import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Application } from 'express';
import { PrismaClient } from '@prisma/client';

export const testPrisma = new PrismaClient();

export const SEEDED_USERS = {
  employee: { email: 'john.doe@finance.gov.mw', password: 'Employee@123' },
  approver: { email: 'approver@finance.gov.mw', password: 'Approver@123' },
  finance: { email: 'finance.officer@finance.gov.mw', password: 'Finance@123' },
} as const;

export async function getBearerTokenForEmail(email: string): Promise<string> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be set for tests');
  }
  const user = await testPrisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`Seeded user not found: ${email}. Run pnpm run db:seed first.`);
  }
  return jwt.sign({ id: user.id }, secret, { expiresIn: '1h' });
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Login via API and return Set-Cookie header value for supertest. */
export async function loginWithCookie(
  app: Application,
  email: string,
  password: string
): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const cookies = res.headers['set-cookie'];
  if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
    throw new Error(`Login for ${email} did not return cookies`);
  }
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

export async function disconnectPrisma(): Promise<void> {
  await testPrisma.$disconnect();
}

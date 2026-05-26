/**
 * Integration tests for the PR manual test plan.
 *
 * Requires:
 *   - DATABASE_URL pointing at a seeded database (pnpm run db:seed)
 *   - JWT_SECRET in .env
 *
 * Run (PowerShell):
 *   $env:RUN_INTEGRATION_TESTS='true'; pnpm run test:integration
 */
jest.mock('../../server', () => {
  const { testPrisma } = require('../helpers/auth');
  return {
    prisma: testPrisma,
    emitNotification: jest.fn(),
    emitSalesUpdate: jest.fn(),
  };
});

import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { createTestApp } from '../helpers/testApp';
import {
  SEEDED_USERS,
  authHeader,
  getBearerTokenForEmail,
  testPrisma,
  disconnectPrisma,
} from '../helpers/auth';

/** Set RUN_INTEGRATION_TESTS=true and ensure DATABASE_URL + db:seed before running. */
const runIntegration =
  process.env.RUN_INTEGRATION_TESTS === 'true' && Boolean(process.env.DATABASE_URL);

const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration('PR plan integration flows', () => {
  const app = createTestApp();
  let employeeToken: string;
  let approverToken: string;
  let financeToken: string;
  let employeeUserId: string;
  let employeeProfileId: string;
  let organizationId: string;
  let departmentId: string;
  let pendingRequestId: string;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-jwt-secret';
    }

    [employeeToken, approverToken, financeToken] = await Promise.all([
      getBearerTokenForEmail(SEEDED_USERS.employee.email),
      getBearerTokenForEmail(SEEDED_USERS.approver.email),
      getBearerTokenForEmail(SEEDED_USERS.finance.email),
    ]);

    const employeeUser = await testPrisma.user.findUnique({
      where: { email: SEEDED_USERS.employee.email },
      include: { employee: { include: { department: true } } },
    });

    if (!employeeUser?.employee) {
      throw new Error('Seeded employee profile missing. Run pnpm run db:seed.');
    }

    employeeUserId = employeeUser.id;
    employeeProfileId = employeeUser.employee.id;
    organizationId = employeeUser.employee.organizationId;
    departmentId = employeeUser.employee.departmentId!;

    const fiscalYear = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
    const existingBudget = await testPrisma.budget.findFirst({
      where: { organizationId, departmentId, fiscalYear },
    });
    if (!existingBudget) {
      await testPrisma.budget.create({
        data: {
          organizationId,
          departmentId,
          fiscalYear,
          allocated: 1_000_000,
          spent: 0,
          committed: 0,
        },
      });
    }

    const pending = await testPrisma.dsaRequest.create({
      data: {
        employeeId: employeeProfileId,
        organizationId,
        requestNumber: `DSA-TEST-${Date.now()}`,
        destination: 'Lilongwe',
        purpose: 'Integration test travel',
        startDate: new Date(Date.now() + 86400000 * 7),
        endDate: new Date(Date.now() + 86400000 * 10),
        duration: 3,
        perDiemRate: 50000,
        totalAmount: 150000,
        status: 'PENDING',
        documents: [],
      },
    });
    pendingRequestId = pending.id;
  });

  afterAll(async () => {
    if (pendingRequestId) {
      await testPrisma.approval.deleteMany({ where: { requestId: pendingRequestId } }).catch(() => {});
      await testPrisma.disbursementItem.deleteMany({ where: { requestId: pendingRequestId } }).catch(() => {});
      await testPrisma.notification.deleteMany({
        where: { userId: employeeUserId, type: { in: ['DSA_APPROVED', 'DSA_REJECTED', 'DSA_PAID'] } },
      }).catch(() => {});
      await testPrisma.dsaRequest.delete({ where: { id: pendingRequestId } }).catch(() => {});
    }
    await disconnectPrisma();
  });

  it('logs in seeded roles and returns 200 on protected dashboard routes', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send(SEEDED_USERS.employee);
    expect(loginRes.status).toBe(200);

    const [empDash, apprDash, finDash] = await Promise.all([
      request(app).get('/api/employee/dashboard').set(authHeader(employeeToken)),
      request(app).get('/api/approver/dashboard').set(authHeader(approverToken)),
      request(app).get('/api/finance/dashboard').set(authHeader(financeToken)),
    ]);

    expect(empDash.status).toBe(200);
    expect(apprDash.status).toBe(200);
    expect(finDash.status).toBe(200);
  });

  it('approver approves a pending DSA request and employee receives a notification', async () => {
    const approveRes = await request(app)
      .post(`/api/approver/requests/${pendingRequestId}/approve`)
      .set(authHeader(approverToken))
      .send({ comments: 'Integration approve' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    const updated = await testPrisma.dsaRequest.findUnique({ where: { id: pendingRequestId } });
    expect(updated?.status).toBe('APPROVED');

    const notification = await testPrisma.notification.findFirst({
      where: {
        userId: employeeUserId,
        type: 'DSA_APPROVED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(notification).toBeTruthy();
  });

  it('finance completes a disbursement batch: items success, requests PAID, budget updates', async () => {
    const fiscalYear = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
    const budgetBefore = await testPrisma.budget.findFirst({
      where: { organizationId, departmentId, fiscalYear },
    });

    const batchRes = await request(app)
      .post('/api/finance/disbursements/batches')
      .set(authHeader(financeToken))
      .send({ requestIds: [pendingRequestId], notes: 'Integration batch' });

    expect(batchRes.status).toBe(201);
    const batchId = batchRes.body.data.batch.id;

    const processRes = await request(app)
      .post(`/api/finance/disbursements/batches/${batchId}/process`)
      .set(authHeader(financeToken))
      .send({ status: 'completed' });

    expect(processRes.status).toBe(200);

    const [requestRow, items, budgetAfter] = await Promise.all([
      testPrisma.dsaRequest.findUnique({ where: { id: pendingRequestId } }),
      testPrisma.disbursementItem.findMany({ where: { batchId } }),
      testPrisma.budget.findFirst({ where: { organizationId, departmentId, fiscalYear } }),
    ]);

    expect(requestRow?.status).toBe('PAID');
    expect(items.every((i) => i.status === 'success')).toBe(true);

    if (budgetBefore && budgetAfter) {
      expect(budgetAfter.spent).toBeGreaterThanOrEqual(budgetBefore.spent);
      expect(budgetAfter.committed).toBeLessThanOrEqual(budgetBefore.committed);
    }
  });

  it('employee uploads and deletes a DSA document on a pending request', async () => {
    const docRequest = await testPrisma.dsaRequest.create({
      data: {
        employeeId: employeeProfileId,
        organizationId,
        requestNumber: `DSA-DOC-${Date.now()}`,
        destination: 'Mzuzu',
        purpose: 'Document upload test',
        startDate: new Date(Date.now() + 86400000 * 14),
        endDate: new Date(Date.now() + 86400000 * 16),
        duration: 2,
        perDiemRate: 40000,
        totalAmount: 80000,
        status: 'PENDING',
        documents: [],
      },
    });

    const uploadsDir = path.join(process.cwd(), 'uploads', 'dsa-documents');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const fixturePath = path.join(uploadsDir, `fixture-${Date.now()}.txt`);
    fs.writeFileSync(fixturePath, 'integration test document');

    const uploadRes = await request(app)
      .post(`/api/employee/dsa/requests/${docRequest.id}/documents`)
      .set(authHeader(employeeToken))
      .attach('file', fixturePath);

    expect(uploadRes.status).toBe(201);
    const documentId = uploadRes.body.data.document.id;

    const afterUpload = await testPrisma.dsaRequest.findUnique({ where: { id: docRequest.id } });
    const docs = (afterUpload?.documents as { id: string }[]) ?? [];
    expect(docs.some((d) => d.id === documentId)).toBe(true);

    const deleteRes = await request(app)
      .delete(`/api/employee/dsa/requests/${docRequest.id}/documents/${documentId}`)
      .set(authHeader(employeeToken));

    expect(deleteRes.status).toBe(200);

    const afterDelete = await testPrisma.dsaRequest.findUnique({ where: { id: docRequest.id } });
    const docsAfter = (afterDelete?.documents as { id: string }[]) ?? [];
    expect(docsAfter.some((d) => d.id === documentId)).toBe(false);

    await testPrisma.dsaRequest.delete({ where: { id: docRequest.id } }).catch(() => {});
  });
});

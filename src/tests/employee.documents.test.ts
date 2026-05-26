import { NextFunction, Response } from 'express';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line no-var
var prismaMock: {
  employee: { findUnique: jest.Mock };
  dsaRequest: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  notification: { create: jest.Mock };
};

prismaMock = {
  employee: { findUnique: jest.fn() },
  dsaRequest: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  notification: { create: jest.fn() },
};

jest.mock('../server', () => ({
  prisma: prismaMock,
}));

jest.mock('../services/document.service', () => ({
  DocumentService: {
    getSignedUrl: jest.fn((url: string) => `${url}?signed=1`),
  },
}));

import { EmployeeController } from '../controllers/employee.controller';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-emp' },
    params: { id: 'req-1', documentId: 'doc-1' },
    file: {
      filename: 'test-upload.pdf',
      originalname: 'travel-auth.pdf',
      size: 1024,
      mimetype: 'application/pdf',
      path: path.join(process.cwd(), 'uploads', 'dsa-documents', 'test-upload.pdf'),
    },
    ...overrides,
  } as any;
}

function makeRes() {
  return {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('EmployeeController documents', () => {
  const controller = new EmployeeController();

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.employee.findUnique.mockResolvedValue({
      id: 'emp-1',
      userId: 'user-emp',
      organizationId: 'org-1',
    });
    prismaMock.notification.create.mockResolvedValue({ id: 'n-1' });
  });

  it('uploadDocument appends to documents JSON on a pending request', async () => {
    prismaMock.dsaRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      status: 'PENDING',
      requestNumber: 'DSA-100',
      documents: [],
    });
    prismaMock.dsaRequest.update.mockResolvedValue({ id: 'req-1' });

    const res = makeRes();
    await controller.uploadDocument(makeReq(), res, jest.fn() as NextFunction);

    expect(prismaMock.dsaRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          documents: expect.arrayContaining([
            expect.objectContaining({
              originalName: 'travel-auth.pdf',
              filename: 'test-upload.pdf',
            }),
          ]),
        },
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('deleteDocument removes entry and updates documents array', async () => {
    prismaMock.dsaRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      status: 'PENDING',
      documents: [
        {
          id: 'doc-1',
          filename: 'keep-me.pdf',
          originalName: 'a.pdf',
        },
        {
          id: 'doc-2',
          filename: 'remove-me.pdf',
          originalName: 'b.pdf',
        },
      ],
    });

    const uploadsDir = path.join(process.cwd(), 'uploads', 'dsa-documents');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const filePath = path.join(uploadsDir, 'remove-me.pdf');
    fs.writeFileSync(filePath, 'test');

    const res = makeRes();
    await controller.deleteDocument(
      makeReq({ params: { id: 'req-1', documentId: 'doc-2' }, file: undefined }),
      res,
      jest.fn() as NextFunction
    );

    expect(prismaMock.dsaRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: {
        documents: [expect.objectContaining({ id: 'doc-1' })],
      },
    });
    expect(fs.existsSync(filePath)).toBe(false);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Document deleted successfully' })
    );
  });
});

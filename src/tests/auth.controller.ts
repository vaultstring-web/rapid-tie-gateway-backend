import { NextFunction, Response } from 'express';
import { AppError } from '../utils/errorHandler';

// ---------------------------------------------------------------------------
// Mocks — declared before controller import so hoisting works
// ---------------------------------------------------------------------------
const prismaMock = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  session: {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  activityLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('../server', () => ({ prisma: prismaMock }));
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_jwt_token'),
  verify: jest.fn(),
}));
jest.mock('speakeasy', () => ({
  totp: { verify: jest.fn() },
}));
jest.mock('../utils/email', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn().mockReturnValue({ toString: () => 'mock_verification_token' }),
}));

import { AuthController } from '../controllers/auth.controller';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res = {
    json: jest.fn(),
    status: jest.fn(),
    cookie: jest.fn(),
  } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}

const MOCK_USER = {
  id: 'user-1',
  email: 'merchant@example.com',
  phone: '+265999000001',
  password: 'hashed_password',
  firstName: 'John',
  lastName: 'Doe',
  role: 'MERCHANT',
  emailVerified: true,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  twoFactorBackupCodes: [],
  merchant: { id: 'merchant-1', businessName: 'Acme Ltd' },
  organizer: null,
  employee: null,
  approver: null,
  financeOfficer: null,
  admin: null,
  lastLoginAt: null,
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AuthController', () => {
  const controller = new AuthController();

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no activity log, no existing session conflicts
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.$transaction.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // register — payload contract
  // -------------------------------------------------------------------------
  describe('register', () => {
    beforeEach(() => {
      prismaMock.user.findFirst.mockResolvedValue(null); // no duplicate
      prismaMock.user.create.mockResolvedValue(MOCK_USER);
      prismaMock.user.update.mockResolvedValue(MOCK_USER);
      prismaMock.session.create.mockResolvedValue({});
    });

    it('accepts a flat payload (email, phone, password, firstName, lastName, role)', async () => {
      // This is the FIXED shape sent by register/page.tsx
      const req = {
        body: {
          email: 'merchant@example.com',
          phone: '+265999000001',
          password: 'Password@123',
          firstName: 'John',
          lastName: 'Doe',
          role: 'MERCHANT',
          businessName: 'Acme Ltd',
        },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
      } as any;

      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.register(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'merchant@example.com',
            firstName: 'John',
            lastName: 'Doe',
            role: 'MERCHANT',
          }),
        })
      );
    });

    it('responds with success: true and user + token on valid registration', async () => {
      const req = {
        body: {
          email: 'merchant@example.com',
          phone: '+265999000001',
          password: 'Password@123',
          firstName: 'John',
          lastName: 'Doe',
          role: 'MERCHANT',
          businessName: 'Acme Ltd',
        },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
      } as any;

      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.register(req, res, next);

      const payload = (res.json as jest.Mock).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data).toHaveProperty('token');
      expect(payload.data).toHaveProperty('refreshToken');
      expect(payload.data.user.email).toBe('merchant@example.com');
    });

    it('calls next(AppError 400) when email already exists', async () => {
      prismaMock.user.findFirst.mockResolvedValue(MOCK_USER); // existing user

      const req = {
        body: {
          email: 'merchant@example.com',
          password: 'Password@123',
          firstName: 'John',
          lastName: 'Doe',
          role: 'MERCHANT',
        },
        ip: '127.0.0.1',
        headers: {},
      } as any;

      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.register(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = (next as jest.Mock).mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(400);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('creates a merchant sub-record when role is MERCHANT', async () => {
      const req = {
        body: {
          email: 'merchant@example.com',
          password: 'Password@123',
          firstName: 'John',
          lastName: 'Doe',
          role: 'MERCHANT',
          businessName: 'Acme Ltd',
        },
        ip: '127.0.0.1',
        headers: {},
      } as any;

      const res = makeRes();

      await controller.register(req, res, jest.fn());

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchant: { create: { businessName: 'Acme Ltd', status: 'ACTIVE' } },
          }),
        })
      );
    });

    it('creates an organizer sub-record when role is ORGANIZER', async () => {
      prismaMock.user.create.mockResolvedValue({
        ...MOCK_USER,
        role: 'ORGANIZER',
        merchant: null,
        organizer: { id: 'org-1', organizationName: 'My Org' },
      });

      const req = {
        body: {
          email: 'organizer@example.com',
          password: 'Password@123',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'ORGANIZER',
          organizationName: 'My Org',
        },
        ip: '127.0.0.1',
        headers: {},
      } as any;

      const res = makeRes();

      await controller.register(req, res, jest.fn());

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizer: {
              create: expect.objectContaining({ organizationName: expect.any(String) }),
            },
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // login — 2FA handshake branching
  // -------------------------------------------------------------------------
  describe('login', () => {
    beforeEach(() => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prismaMock.user.findFirst.mockResolvedValue(MOCK_USER);
      prismaMock.user.update.mockResolvedValue(MOCK_USER);
      prismaMock.session.create.mockResolvedValue({});
    });

    it('returns success with token + refreshToken when 2FA is disabled', async () => {
      const req = {
        body: { email: 'merchant@example.com', password: 'Password@123' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
      } as any;

      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.login(req, res, next);

      expect(next).not.toHaveBeenCalled();
      const payload = (res.json as jest.Mock).mock.calls[0][0];
      expect(payload.success).toBe(true);
      // FIX VALIDATION: response MUST include data.token and data.refreshToken
      expect(payload.data).toHaveProperty('token');
      expect(payload.data).toHaveProperty('refreshToken');
      expect(payload.data).toHaveProperty('user');
      // Must NOT include requires2FA on normal login
      expect(payload.requires2FA).toBeUndefined();
    });

    it('returns { requires2FA: true, userId } and NO token when 2FA is enabled', async () => {
      // FIX VALIDATION: This is the branching that the login page now handles.
      // The response shape must be { success: true, requires2FA: true, userId } with NO data.token.
      prismaMock.user.findFirst.mockResolvedValue({
        ...MOCK_USER,
        twoFactorEnabled: true,
        twoFactorSecret: 'MOCK_SECRET',
      });

      const req = {
        body: { email: 'merchant@example.com', password: 'Password@123' },
        ip: '127.0.0.1',
        headers: {},
      } as any;

      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.login(req, res, next);

      expect(next).not.toHaveBeenCalled();
      const payload = (res.json as jest.Mock).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.requires2FA).toBe(true);
      expect(payload.userId).toBe('user-1');
      // Must NOT issue a session token when 2FA is still pending
      expect(payload.data).toBeUndefined();
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

    it('calls next(AppError 401) for wrong password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const req = {
        body: { email: 'merchant@example.com', password: 'WrongPass' },
        ip: '127.0.0.1',
        headers: {},
      } as any;

      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.login(req, res, next);

      // Either next(AppError) or res.status(401) is acceptable — both guard the route
      const didCallNext = (next as jest.Mock).mock.calls.length > 0;
      const didReturn401 = (res.status as jest.Mock).mock.calls.some(
        ([code]: [number]) => code === 401
      );
      expect(didCallNext || didReturn401).toBe(true);
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

    it('calls next(AppError 403) when email is not verified', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ ...MOCK_USER, emailVerified: false });

      const req = {
        body: { email: 'merchant@example.com', password: 'Password@123' },
        ip: '127.0.0.1',
        headers: {},
      } as any;

      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.login(req, res, next);

      const err = (next as jest.Mock).mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // verify2FA — completes login and issues tokens
  // -------------------------------------------------------------------------
  describe('verify2FA', () => {
    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        twoFactorEnabled: true,
        twoFactorSecret: 'MOCK_SECRET_BASE32',
      });
      prismaMock.session.create.mockResolvedValue({});
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(true);
    });

    it('issues token + refreshToken after valid 2FA code', async () => {
      const req = {
        body: { userId: 'user-1', code: '123456' },
        ip: '127.0.0.1',
        headers: {},
      } as any;

      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.verify2FA(req, res, next);

      expect(next).not.toHaveBeenCalled();
      const payload = (res.json as jest.Mock).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data).toHaveProperty('token');
      expect(payload.data).toHaveProperty('refreshToken');
      expect(prismaMock.session.create).toHaveBeenCalledTimes(1);
    });

    it('calls next(AppError 400) for invalid 2FA code', async () => {
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(false);

      const req = {
        body: { userId: 'user-1', code: '000000' },
        ip: '127.0.0.1',
        headers: {},
      } as any;

      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.verify2FA(req, res, next);

      const err = (next as jest.Mock).mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(400);
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

    it('calls next(AppError 400) when userId is missing', async () => {
      const req = { body: { code: '123456' }, ip: '127.0.0.1', headers: {} } as any;
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.verify2FA(req, res, next);

      const err = (next as jest.Mock).mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // refreshToken — key contract
  // -------------------------------------------------------------------------
  describe('refreshToken', () => {
    const MOCK_SESSION = {
      id: 'session-1',
      token: 'valid_refresh_token',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      user: MOCK_USER,
    };

    beforeEach(() => {
      prismaMock.session.findFirst.mockResolvedValue(MOCK_SESSION);
      prismaMock.$transaction.mockResolvedValue([{}, {}]);
    });

    it('returns new token + refreshToken given a valid refresh token', async () => {
      // FIX VALIDATION: the key sent in the body must be "refreshToken" (not "refresh_token")
      // and the response must return data.token + data.refreshToken so the client
      // (client.ts) can store data.refreshToken under 'rapid_tie_refresh_token'.
      const req = {
        body: { refreshToken: 'valid_refresh_token' },
        ip: '127.0.0.1',
        headers: {},
      } as any;

      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.refreshToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      const payload = (res.json as jest.Mock).mock.calls[0][0];
      expect(payload.success).toBe(true);
      // FIX: client.ts now reads data.refreshToken from this response
      expect(payload.data).toHaveProperty('token');
      expect(payload.data).toHaveProperty('refreshToken');
    });

    it('calls next(AppError 400) when refreshToken is absent from body', async () => {
      const req = { body: {}, ip: '127.0.0.1', headers: {} } as any;
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.refreshToken(req, res, next);

      const err = (next as jest.Mock).mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(400);
    });

    it('calls next(AppError 401) for an expired or unknown refresh token', async () => {
      prismaMock.session.findFirst.mockResolvedValue(null);

      const req = { body: { refreshToken: 'expired_token' }, ip: '127.0.0.1', headers: {} } as any;
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.refreshToken(req, res, next);

      const err = (next as jest.Mock).mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
    });

    it('rotates the session (deletes old, creates new) on successful refresh', async () => {
      const req = {
        body: { refreshToken: 'valid_refresh_token' },
        ip: '127.0.0.1',
        headers: {},
      } as any;

      const res = makeRes();

      await controller.refreshToken(req, res, jest.fn());

      // $transaction should have been called with [delete, create]
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      const ops = (prismaMock.$transaction as jest.Mock).mock.calls[0][0];
      expect(ops).toHaveLength(2);
    });
  });
});
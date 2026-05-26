import express, { Application } from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from '../../routes/auth.routes';
import approverRoutes from '../../routes/approver.routes';
import financeRoutes from '../../routes/finance.routes';
import employeeRoutes from '../../routes/employee.routes';
import paymentRoutes from '../../routes/payment.routes';
import { notfound } from '../../middlewares/notfound';
import { errorHandler } from '../../utils/errorHandler';

dotenv.config();

/** Minimal Express app for HTTP integration tests (no Socket.IO / listen). */
export function createTestApp(): Application {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  app.use('/api/approver', approverRoutes);
  app.use('/api/finance', financeRoutes);
  app.use('/api/employee', employeeRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use(notfound);
  app.use(errorHandler);
  return app;
}

// services/auditLog.service.ts
import { prisma } from '../server';
import crypto from 'crypto';

// Secret key for hash generation (store in env)
const AUDIT_SECRET = process.env.AUDIT_SECRET || 'your-audit-secret-key';

// Get the last audit log to chain hashes
async function getLastAuditLog() {
  return await prisma.auditLog.findFirst({
    orderBy: { createdAt: 'desc' },
  });
}

// Generate hash for audit log entry
export function generateHash(data: any, previousHash: string | null): string {
  const content = JSON.stringify({
    ...data,
    previousHash,
    secret: AUDIT_SECRET,
  });
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Create audit log entry with tamper-proof hash
export async function createAuditLog(data: {
  transactionId?: string;
  userId?: string;
  action: string;
  status: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  entityType?: string;
  entityId?: string;
  oldValues?: any;
  newValues?: any;
}): Promise<any> {
  // Get the last log for chaining
  const lastLog = await getLastAuditLog();
  const previousHash = lastLog?.hash || null;
  
  // Prepare data for hashing
  const hashData = {
    ...data,
    timestamp: new Date().toISOString(),
  };
  
  // Generate hash
  const hash = generateHash(hashData, previousHash);
  
  // Create log entry
  const auditLog = await prisma.auditLog.create({
    data: {
      ...data,
      hash,
      previousHash,
    },
  });
  
  return auditLog;
}

// Verify audit log integrity (check if any log has been tampered)
export async function verifyAuditIntegrity(): Promise<{ valid: boolean; tamperedLogs: string[] }> {
  const allLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'asc' },
  });
  
  const tamperedLogs: string[] = [];
  let previousHash: string | null = null;
  
  for (const log of allLogs) {
    // Verify chain continuity
    if (log.previousHash !== previousHash) {
      tamperedLogs.push(log.id);
      continue;
    }
    
    // Verify log hash
    const hashData = {
      transactionId: log.transactionId,
      userId: log.userId,
      action: log.action,
      status: log.status,
      details: log.details,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      entityType: log.entityType,
      entityId: log.entityId,
      oldValues: log.oldValues,
      newValues: log.newValues,
      timestamp: log.createdAt.toISOString(),
    };
    
    const expectedHash = generateHash(hashData, previousHash);
    if (expectedHash !== log.hash) {
      tamperedLogs.push(log.id);
    }
    
    previousHash = log.hash;
  }
  
  return {
    valid: tamperedLogs.length === 0,
    tamperedLogs,
  };
}
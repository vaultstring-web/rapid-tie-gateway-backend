// controllers/admin/systemHealth.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../../server';
import os from 'os';
import fs from 'fs';

// Cache for health metrics
const healthCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 30 * 1000; // 30 seconds

// Check database connection
async function checkDatabaseHealth(): Promise<{ status: string; latency: number; details?: any }> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    return {
      status: 'healthy',
      latency,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      details: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

// Check Redis cache health (if Redis is configured)
async function checkRedisHealth(): Promise<{ status: string; latency: number; details?: any }> {
  // Check if Redis is configured
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return {
      status: 'not_configured',
      latency: 0,
      details: 'Redis is not configured',
    };
  }

  const start = Date.now();
  try {
    // Dynamic import for Redis client
    const redis = await import('redis');
    const client = redis.createClient({ url: redisUrl });
    
    await client.connect();
    await client.ping();
    await client.quit();
    
    const latency = Date.now() - start;
    return {
      status: 'healthy',
      latency,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      details: error instanceof Error ? error.message : 'Redis connection failed',
    };
  }
}

// Check queue workers status
async function checkQueueWorkers(): Promise<{ status: string; details: any }> {
  try {
    // Check for pending jobs in various queues
    const pendingEmails = await getPendingEmailCount();
    const pendingMessages = await getPendingMessageCount();
    const pendingNotifications = await getPendingNotificationCount();
    
    const totalPending = pendingEmails + pendingMessages + pendingNotifications;
    
    if (totalPending > 1000) {
      return {
        status: 'warning',
        details: {
          message: `High queue backlog: ${totalPending} pending jobs`,
          pendingEmails,
          pendingMessages,
          pendingNotifications,
          threshold: 1000,
        },
      };
    }
    
    return {
      status: 'healthy',
      details: {
        pendingEmails,
        pendingMessages,
        pendingNotifications,
        totalPending,
      },
    };
  } catch (error) {
    return {
      status: 'unknown',
      details: {
        error: error instanceof Error ? error.message : 'Failed to check queue status',
      },
    };
  }
}

// Helper functions for queue counts
async function getPendingEmailCount(): Promise<number> {
  try {
    // Get pending email communications
    const pendingCommunications = await prisma.communicationRecipient.count({
      where: {
        status: 'pending',
      },
    });
    return pendingCommunications;
  } catch {
    return 0;
  }
}

async function getPendingMessageCount(): Promise<number> {
  try {
    // Get unread messages
    const unreadMessages = await prisma.message.count({
      where: { isRead: false },
    });
    return unreadMessages;
  } catch {
    return 0;
  }
}

async function getPendingNotificationCount(): Promise<number> {
  try {
    // Get unread notifications
    const unreadNotifications = await prisma.notification.count({
      where: { read: false },
    });
    return unreadNotifications;
  } catch {
    return 0;
  }
}

// Check storage utilization
async function checkStorageUtilization(): Promise<{ status: string; details: any }> {
  try {
    // Get disk space info for different directories
    const uploadsPath = './uploads';
    const logsPath = './logs';
    
    let uploadsSize = 0;
    let logsSize = 0;
    
    // Get uploads directory size
    if (fs.existsSync(uploadsPath)) {
      uploadsSize = await getDirectorySize(uploadsPath);
    }
    
    // Get logs directory size
    if (fs.existsSync(logsPath)) {
      logsSize = await getDirectorySize(logsPath);
    }
    
    // Get database size (approximate from PostgreSQL)
    let dbSize = 0;
    try {
      const result = await prisma.$queryRaw`SELECT pg_database_size(current_database()) as size`;
      dbSize = Number((result as any)[0]?.size) || 0;
    } catch {
      dbSize = 0;
    }
    
    const totalUsed = uploadsSize + logsSize + dbSize;
    const totalAvailable = os.freemem();
    const usagePercent = (totalUsed / totalAvailable) * 100;
    
    let status = 'healthy';
    if (usagePercent > 80) {
      status = 'warning';
    } else if (usagePercent > 90) {
      status = 'critical';
    }
    
    return {
      status,
      details: {
        uploads: {
          size: uploadsSize,
          formatted: formatBytes(uploadsSize),
        },
        logs: {
          size: logsSize,
          formatted: formatBytes(logsSize),
        },
        database: {
          size: dbSize,
          formatted: formatBytes(dbSize),
        },
        totalUsed: {
          size: totalUsed,
          formatted: formatBytes(totalUsed),
        },
        usagePercent: usagePercent.toFixed(2),
        status,
      },
    };
  } catch (error) {
    return {
      status: 'unknown',
      details: {
        error: error instanceof Error ? error.message : 'Failed to check storage',
      },
    };
  }
}

// Helper to get directory size recursively
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = `${dirPath}/${file}`;
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  
  return totalSize;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Check overall system health
export const getSystemHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if user is admin
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const cacheKey = 'system_health';
    const cached = healthCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      res.status(200).json({
        success: true,
        data: cached.data,
        cached: true,
      });
      return;
    }

    // Gather all health metrics in parallel
    const [database, redis, queueWorkers, storage] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      checkQueueWorkers(),
      checkStorageUtilization(),
    ]);

    // Overall system status
    const overallStatus = 
      database.status === 'healthy' && 
      redis.status !== 'unhealthy' && 
      queueWorkers.status !== 'critical' &&
      storage.status !== 'critical'
        ? 'healthy'
        : queueWorkers.status === 'critical' || storage.status === 'critical'
        ? 'critical'
        : 'degraded';

    const healthData = {
      timestamp: new Date().toISOString(),
      overall: {
        status: overallStatus,
        message: getStatusMessage(overallStatus),
      },
      components: {
        database,
        redis,
        queueWorkers,
        storage,
      },
    };

    // Cache the response
    healthCache.set(cacheKey, {
      data: healthData,
      expiresAt: Date.now() + CACHE_DURATION,
    });

    res.status(200).json({
      success: true,
      data: healthData,
      cached: false,
    });
  } catch (error) {
    console.error('System health error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system health',
    });
  }
};

// Get detailed system metrics
export const getSystemMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    // System uptime
    const uptime = process.uptime();
    
    // CPU usage
    const cpus = os.cpus();
    const cpuCount = cpus.length;
    const cpuModel = cpus[0]?.model || 'Unknown';
    const loadAvg = os.loadavg();
    
    // Memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
    
    // Process memory
    const processMemory = process.memoryUsage();
    
    // Platform info
    const platform = {
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      hostname: os.hostname(),
      nodeVersion: process.version,
      pid: process.pid,
      platform: process.platform,
    };

    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: uptime,
        formatted: formatUptime(uptime),
      },
      cpu: {
        cores: cpuCount,
        model: cpuModel,
        loadAverage: {
          oneMinute: loadAvg[0],
          fiveMinutes: loadAvg[1],
          fifteenMinutes: loadAvg[2],
        },
        usagePercent: (loadAvg[0] / cpuCount) * 100,
      },
      memory: {
        total: totalMemory,
        totalFormatted: formatBytes(totalMemory),
        free: freeMemory,
        freeFormatted: formatBytes(freeMemory),
        used: usedMemory,
        usedFormatted: formatBytes(usedMemory),
        usagePercent: memoryUsagePercent.toFixed(2),
      },
      process: {
        rss: processMemory.rss,
        rssFormatted: formatBytes(processMemory.rss),
        heapTotal: processMemory.heapTotal,
        heapTotalFormatted: formatBytes(processMemory.heapTotal),
        heapUsed: processMemory.heapUsed,
        heapUsedFormatted: formatBytes(processMemory.heapUsed),
        external: processMemory.external,
        externalFormatted: formatBytes(processMemory.external),
      },
      platform,
    };

    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    console.error('System metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system metrics',
    });
  }
};

// Format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0) parts.push(`${secs}s`);
  
  return parts.join(' ') || '0s';
}

// Get status message
function getStatusMessage(status: string): string {
  switch (status) {
    case 'healthy':
      return 'All systems operational';
    case 'degraded':
      return 'Some services are experiencing issues';
    case 'critical':
      return 'Critical issues detected, immediate attention required';
    default:
      return 'Status unknown';
  }
}

// Clear health cache
export const clearHealthCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    healthCache.clear();
    res.status(200).json({
      success: true,
      message: 'Health cache cleared',
    });
  } catch (error) {
    console.error('Clear health cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
    });
  }
};
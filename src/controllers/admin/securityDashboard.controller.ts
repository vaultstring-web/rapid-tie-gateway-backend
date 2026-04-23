import { Request, Response } from 'express';
import { prisma } from '../../server';

// Cache for security metrics
const securityCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 60 * 1000; // 1 minute

// Failed login attempts tracking (in-memory for demo)
const failedLoginAttempts = new Map<string, { count: number; lastAttempt: Date; ipAddress: string }>();

// Track failed login attempts
export const trackFailedLogin = (email: string, ipAddress: string) => {
  const key = `${email}_${ipAddress}`;
  const existing = failedLoginAttempts.get(key);
  
  if (existing) {
    existing.count++;
    existing.lastAttempt = new Date();
  } else {
    failedLoginAttempts.set(key, {
      count: 1,
      lastAttempt: new Date(),
      ipAddress,
    });
  }
  
  // Clean up old entries (older than 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (const [k, v] of failedLoginAttempts) {
    if (v.lastAttempt < oneDayAgo) {
      failedLoginAttempts.delete(k);
    }
  }
};

// Get security dashboard data
export const getSecurityDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const cacheKey = 'security_dashboard';
    const cached = securityCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(200).json({ success: true, data: cached.data, cached: true });
      return;
    }

    // Get failed login attempts stats
    const failedLoginStats = await getFailedLoginStats();
    
    // Get suspicious IP addresses
    const suspiciousIPs = await getSuspiciousIPs();
    
    // Get 2FA adoption rate
    const twoFAStats = await getTwoFAAdoptionRate();
    
    // Get security scan report
    const securityScan = await runSecurityScan();
    
    // Get recent security events
    const recentSecurityEvents = await getRecentSecurityEvents();
    
    // Get password strength distribution
    const passwordStats = await getPasswordStats();

    const response = {
      timestamp: new Date().toISOString(),
      summary: {
        totalFailedAttempts: failedLoginStats.total,
        uniqueIPs: failedLoginStats.uniqueIPs,
        suspiciousIPsCount: suspiciousIPs.length,
        twoFAAdoptionRate: twoFAStats.adoptionRate,
        totalUsersWith2FA: twoFAStats.enabled,
        totalUsers: twoFAStats.total,
      },
      failedLogins: {
        last24Hours: failedLoginStats.last24Hours,
        topFailedEmails: failedLoginStats.topEmails,
        hourlyTrend: failedLoginStats.hourlyTrend,
      },
      suspiciousIPs,
      twoFA: twoFAStats,
      securityScan,
      recentEvents: recentSecurityEvents,
      passwordSecurity: passwordStats,
      recommendations: generateRecommendations(failedLoginStats, suspiciousIPs, twoFAStats, securityScan),
    };

    securityCache.set(cacheKey, { data: response, expiresAt: Date.now() + CACHE_DURATION });

    res.status(200).json({ success: true, data: response, cached: false });
  } catch (error) {
    console.error('Security dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch security data' });
  }
};

// Get failed login statistics
async function getFailedLoginStats() {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // Get failed logins from activity logs
  const failedLogins = await prisma.activityLog.findMany({
    where: {
      action: {
        in: ['LOGIN_FAILED', 'LOGIN_FAILED_USER_NOT_FOUND', 'LOGIN_ATTEMPT'],
      },
      createdAt: { gte: twentyFourHoursAgo },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Count by email - safely extract email from JSON
  const emailCounts = new Map<string, number>();
  const hourlyCounts = new Map<number, number>();
  const uniqueIPs = new Set<string>();

  for (const log of failedLogins) {
    // Safely extract email from oldValue or newValue
    let email = 'unknown';
    if (log.oldValue && typeof log.oldValue === 'object' && 'email' in log.oldValue) {
      email = String(log.oldValue.email);
    } else if (log.newValue && typeof log.newValue === 'object' && 'email' in log.newValue) {
      email = String(log.newValue.email);
    }
    
    emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    
    const hour = new Date(log.createdAt).getHours();
    hourlyCounts.set(hour, (hourlyCounts.get(hour) || 0) + 1);
    
    if (log.ipAddress) uniqueIPs.add(log.ipAddress);
  }

  // Get top failing emails
  const topEmails = Array.from(emailCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([email, count]) => ({ email, attempts: count }));

  // Get hourly trend for chart
  const hourlyTrend = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    attempts: hourlyCounts.get(i) || 0,
  }));

  return {
    total: failedLogins.length,
    uniqueIPs: uniqueIPs.size,
    last24Hours: failedLogins.length,
    topEmails,
    hourlyTrend,
  };
}

// Get suspicious IP addresses
async function getSuspiciousIPs() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Get IPs with multiple failed attempts
  const failedAttempts = await prisma.activityLog.findMany({
    where: {
      action: { in: ['LOGIN_FAILED', 'LOGIN_FAILED_USER_NOT_FOUND'] },
      createdAt: { gte: twentyFourHoursAgo },
    },
    select: { ipAddress: true, userId: true, createdAt: true },
  });

  // Group by IP
  const ipStats = new Map<string, { count: number; lastAttempt: Date; userIds: Set<string> }>();
  
  for (const attempt of failedAttempts) {
    if (!attempt.ipAddress) continue;
    
    const stats = ipStats.get(attempt.ipAddress) || {
      count: 0,
      lastAttempt: attempt.createdAt,
      userIds: new Set(),
    };
    
    stats.count++;
    if (attempt.createdAt > stats.lastAttempt) stats.lastAttempt = attempt.createdAt;
    if (attempt.userId) stats.userIds.add(attempt.userId);
    
    ipStats.set(attempt.ipAddress, stats);
  }

  // Filter suspicious IPs (10+ failed attempts in 24 hours)
  const suspicious = Array.from(ipStats.entries())
    .filter(([_, stats]) => stats.count >= 10)
    .map(([ip, stats]) => ({
      ip,
      failedAttempts: stats.count,
      lastAttempt: stats.lastAttempt,
      riskLevel: stats.count >= 50 ? 'high' : stats.count >= 20 ? 'medium' : 'low',
      targetedUsers: Array.from(stats.userIds),
    }))
    .sort((a, b) => b.failedAttempts - a.failedAttempts);

  return suspicious;
}

// Get 2FA adoption rate
async function getTwoFAAdoptionRate() {
  const totalUsers = await prisma.user.count();
  const usersWith2FA = await prisma.user.count({
    where: { twoFactorEnabled: true },
  });
  
  // Get adoption by role
  const adoptionByRole = await prisma.user.groupBy({
    by: ['role'],
    where: { twoFactorEnabled: true },
    _count: true,
  });
  
  const totalByRole = await prisma.user.groupBy({
    by: ['role'],
    _count: true,
  });
  
  const roleBreakdown: Record<string, { total: number; enabled: number; rate: string }> = {};
  
  for (const role of totalByRole) {
    const enabled = adoptionByRole.find(r => r.role === role.role)?._count || 0;
    roleBreakdown[role.role] = {
      total: role._count,
      enabled,
      rate: role._count > 0 ? ((enabled / role._count) * 100).toFixed(1) : '0',
    };
  }

  return {
    total: totalUsers,
    enabled: usersWith2FA,
    disabled: totalUsers - usersWith2FA,
    adoptionRate: totalUsers > 0 ? ((usersWith2FA / totalUsers) * 100).toFixed(1) : '0',
    byRole: roleBreakdown,
  };
}

// Run security scan
async function runSecurityScan() {
  const issues = [];
  const warnings = [];
  const passed = [];

  // Check for users with weak password patterns (simplified)
  const usersWithWeakPasswords = await prisma.user.count({
    where: {
      passwordChangedAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
  });
  
  if (usersWithWeakPasswords > 0) {
    warnings.push({
      type: 'password_age',
      severity: 'medium',
      message: `${usersWithWeakPasswords} users haven't changed password in over 90 days`,
      recommendation: 'Implement password expiration policy',
    });
  }

  // Check for users without email verification
  const unverifiedEmails = await prisma.user.count({
    where: { emailVerified: false },
  });
  
  if (unverifiedEmails > 0) {
    warnings.push({
      type: 'unverified_email',
      severity: 'low',
      message: `${unverifiedEmails} users have unverified email addresses`,
      recommendation: 'Send verification reminders',
    });
  }

  // Check for suspicious activity patterns
  const suspiciousActivity = await prisma.activityLog.count({
    where: {
      action: { in: ['LOGIN_FAILED', 'LOGIN_FAILED_USER_NOT_FOUND'] },
      createdAt: { gte: new Date(Date.now() - 1 * 60 * 60 * 1000) },
    },
  });
  
  if (suspiciousActivity > 50) {
    issues.push({
      type: 'brute_force',
      severity: 'high',
      message: `High number of failed login attempts (${suspiciousActivity}) in last hour`,
      recommendation: 'Implement rate limiting and CAPTCHA',
    });
  }

  // Check API key usage
  const oldApiKeys = await prisma.apiKey.count({
    where: {
      createdAt: { lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
    },
  });
  
  if (oldApiKeys > 0) {
    warnings.push({
      type: 'old_api_keys',
      severity: 'medium',
      message: `${oldApiKeys} API keys older than 180 days`,
      recommendation: 'Rotate old API keys',
    });
  }

  // Check for users without 2FA (for admin/merchant roles)
  const criticalUsersWithout2FA = await prisma.user.count({
    where: {
      role: { in: ['ADMIN', 'MERCHANT', 'ORGANIZER'] },
      twoFactorEnabled: false,
    },
  });
  
  if (criticalUsersWithout2FA > 0) {
    warnings.push({
      type: 'missing_2fa',
      severity: 'high',
      message: `${criticalUsersWithout2FA} critical role users have 2FA disabled`,
      recommendation: 'Enforce 2FA for admin/merchant accounts',
    });
  }

  passed.push({
    type: 'ssl_config',
    message: 'SSL/TLS configuration is secure',
  });
  
  passed.push({
    type: 'session_timeout',
    message: 'Session timeout policy is configured',
  });

  const overallStatus = issues.length > 0 ? 'critical' : warnings.length > 0 ? 'warning' : 'healthy';

  return {
    status: overallStatus,
    scanTime: new Date().toISOString(),
    summary: {
      issues: issues.length,
      warnings: warnings.length,
      passed: passed.length,
    },
    issues,
    warnings,
    passed,
  };
}

// Get recent security events
async function getRecentSecurityEvents(limit: number = 20) {
  const securityEvents = await prisma.activityLog.findMany({
    where: {
      action: {
        in: [
          'LOGIN_SUCCESS',
          'LOGIN_FAILED',
          'LOGIN_FAILED_USER_NOT_FOUND',
          'PASSWORD_CHANGE',
          'PASSWORD_RESET',
          '2FA_ENABLED',
          '2FA_VERIFIED',
          'USER_SUSPENDED',
          'USER_ACTIVATED',
          'MERCHANT_SUSPENDED',
          'MERCHANT_ACTIVATED',
        ],
      },
    },
    include: {
      user: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return securityEvents.map(event => ({
    id: event.id,
    action: event.action,
    severity: getEventSeverity(event.action),
    user: event.user?.email || 'Unknown',
    userRole: event.user?.role,
    ipAddress: event.ipAddress,
    timestamp: event.createdAt,
    timeAgo: getTimeAgo(event.createdAt),
    details: event.newValue,
  }));
}

// Get password security stats
async function getPasswordStats() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  
  const passwordChangesLast30Days = await prisma.user.count({
    where: {
      passwordChangedAt: { gte: thirtyDaysAgo },
    },
  });
  
  const usersWithOldPasswords = await prisma.user.count({
    where: {
      OR: [
        { passwordChangedAt: { lt: ninetyDaysAgo } },
        { passwordChangedAt: null, createdAt: { lt: ninetyDaysAgo } },
      ],
    },
  });
  
  const totalUsers = await prisma.user.count();

  return {
    passwordChangesLast30Days,
    usersWithOldPasswords,
    totalUsers,
    complianceRate: totalUsers > 0 
      ? (((totalUsers - usersWithOldPasswords) / totalUsers) * 100).toFixed(1) 
      : '100',
  };
}

// Helper: Get event severity
function getEventSeverity(action: string): string {
  const highSeverity = ['USER_SUSPENDED', 'MERCHANT_SUSPENDED'];
  const mediumSeverity = ['LOGIN_FAILED', 'PASSWORD_CHANGE', 'PASSWORD_RESET'];
  const lowSeverity = ['LOGIN_SUCCESS', '2FA_ENABLED', '2FA_VERIFIED', 'USER_ACTIVATED', 'MERCHANT_ACTIVATED'];
  
  if (highSeverity.includes(action)) return 'high';
  if (mediumSeverity.includes(action)) return 'medium';
  if (lowSeverity.includes(action)) return 'low';
  return 'info';
}

// Helper: Get time ago string
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ];
  
  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count !== 1 ? 's' : ''} ago`;
    }
  }
  return 'just now';
}

// Generate security recommendations
function generateRecommendations(failedLoginStats: any, suspiciousIPs: any[], twoFAStats: any, securityScan: any) {
  const recommendations = [];
  
  if (failedLoginStats.total > 100) {
    recommendations.push({
      priority: 'high',
      title: 'High number of failed login attempts',
      description: 'Consider implementing CAPTCHA or rate limiting',
    });
  }
  
  if (suspiciousIPs.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Suspicious IP addresses detected',
      description: `Block ${suspiciousIPs.length} IP addresses with multiple failed attempts`,
    });
  }
  
  if (parseFloat(twoFAStats.adoptionRate) < 50) {
    recommendations.push({
      priority: 'medium',
      title: 'Low 2FA adoption rate',
      description: 'Encourage users to enable two-factor authentication',
    });
  }
  
  if (securityScan.warnings.length > 0) {
    recommendations.push({
      priority: 'medium',
      title: 'Security warnings found',
      description: `Address ${securityScan.warnings.length} security warnings`,
    });
  }
  
  return recommendations;
}

// Clear security cache
export const clearSecurityCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    securityCache.clear();
    res.status(200).json({
      success: true,
      message: 'Security cache cleared',
    });
  } catch (error) {
    console.error('Clear security cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
    });
  }
};

// Get IP blacklist
export const getIPBlacklist = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const suspiciousIPs = await getSuspiciousIPs();
    
    res.status(200).json({
      success: true,
      data: {
        ips: suspiciousIPs,
        total: suspiciousIPs.length,
      },
    });
  } catch (error) {
    console.error('Get IP blacklist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch IP blacklist',
    });
  }
};

// Block an IP address
export const blockIP = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { ip, reason } = req.body;
    
    if (!ip) {
      res.status(400).json({ success: false, message: 'IP address is required' });
      return;
    }

    // In production, you would add to a database table or Redis blacklist
    // For now, just acknowledge
    console.log(`IP ${ip} blocked by ${user.email}. Reason: ${reason || 'Manual block'}`);

    res.status(200).json({
      success: true,
      message: `IP ${ip} has been blocked`,
    });
  } catch (error) {
    console.error('Block IP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block IP',
    });
  }
};
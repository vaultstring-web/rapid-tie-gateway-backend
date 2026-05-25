// controllers/admin.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../server';
import { Prisma } from '@prisma/client';
import os from 'os';

// Cache for admin metrics
const metricsCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 60 * 1000; // 1 minute

// Get system health metrics
async function getSystemHealth() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  
  const cpus = os.cpus();
  const cpuCount = cpus.length;
  const cpuModel = cpus[0]?.model || 'Unknown';
  const loadAvg = os.loadavg();
  const uptime = process.uptime();
  
  let dbStatus = 'connected';
  let dbLatency = 0;
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - start;
  } catch (error) {
    dbStatus = 'disconnected';
  }
  
  const diskInfo = {
    platform: process.platform,
    nodeVersion: process.version,
    pid: process.pid,
  };
  
  return {
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
      totalFormatted: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
      used: usedMemory,
      usedFormatted: `${(usedMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
      free: freeMemory,
      freeFormatted: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
      usagePercent: ((usedMemory / totalMemory) * 100).toFixed(2),
    },
    database: {
      status: dbStatus,
      latency: dbLatency,
    },
    uptime: {
      seconds: uptime,
      formatted: formatUptime(uptime),
    },
    system: diskInfo,
  };
}

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

async function getActiveUsersByRole() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const users = await prisma.user.groupBy({
    by: ['role'],
    _count: true,
    where: {
      lastLoginAt: {
        gte: thirtyDaysAgo,
      },
    },
  });
  
  const total = await prisma.user.count();
  const activeTotal = users.reduce((sum, u) => sum + u._count, 0);
  
  const roleMap: Record<string, number> = {};
  users.forEach(u => {
    roleMap[u.role] = u._count;
  });
  
  return {
    total,
    activeTotal,
    activePercentage: total > 0 ? ((activeTotal / total) * 100).toFixed(1) : '0',
    byRole: {
      ADMIN: roleMap.ADMIN || 0,
      MERCHANT: roleMap.MERCHANT || 0,
      ORGANIZER: roleMap.ORGANIZER || 0,
      EMPLOYEE: roleMap.EMPLOYEE || 0,
      APPROVER: roleMap.APPROVER || 0,
      FINANCE_OFFICER: roleMap.FINANCE_OFFICER || 0,
      PUBLIC: roleMap.PUBLIC || 0,
    },
  };
}

async function getPlatformEventMetrics() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const totalEvents = await prisma.event.count();
  const publishedEvents = await prisma.event.count({ where: { status: 'PUBLISHED' } });
  const completedEvents = await prisma.event.count({ where: { status: 'COMPLETED' } });
  const cancelledEvents = await prisma.event.count({ where: { status: 'CANCELLED' } });
  const recentEvents = await prisma.event.count({ where: { createdAt: { gte: thirtyDaysAgo } } });
  
  const totalTicketsSold = await prisma.ticket.count();
  const activeTickets = await prisma.ticket.count({ where: { status: 'ACTIVE' } });
  const usedTickets = await prisma.ticket.count({ where: { status: 'USED' } });
  
  const transactions = await prisma.transaction.aggregate({
    where: { status: 'success' },
    _sum: { amount: true, fee: true, netAmount: true },
  });
  
  const totalRevenue = transactions._sum.amount || 0;
  const totalFees = transactions._sum.fee || 0;
  const netRevenue = transactions._sum.netAmount || 0;
  
  const recentTransactions = await prisma.transaction.aggregate({
    where: { status: 'success', createdAt: { gte: thirtyDaysAgo } },
    _sum: { amount: true },
  });
  const recentRevenue = recentTransactions._sum.amount || 0;
  
  const totalEventViews = await prisma.eventView.count();
  const recentEventViews = await prisma.eventView.count({ where: { viewedAt: { gte: thirtyDaysAgo } } });
  
  const topEvents = await prisma.ticket.groupBy({
    by: ['eventId'],
    _count: true,
    orderBy: { _count: { eventId: 'desc' } },
    take: 5,
  });
  
  const topEventsWithNames = await Promise.all(
    topEvents.map(async (e) => {
      const event = await prisma.event.findUnique({
        where: { id: e.eventId },
        select: { name: true, organizer: { select: { organizationName: true } } },
      });
      return {
        eventId: e.eventId,
        eventName: event?.name || 'Unknown',
        organizer: event?.organizer?.organizationName || 'Unknown',
        ticketsSold: e._count,
      };
    })
  );
  
  const weeklyGrowth = await getWeeklyGrowth();
  
  return {
    events: {
      total: totalEvents,
      published: publishedEvents,
      completed: completedEvents,
      cancelled: cancelledEvents,
      recent: recentEvents,
      views: totalEventViews,
      recentViews: recentEventViews,
    },
    tickets: {
      totalSold: totalTicketsSold,
      active: activeTickets,
      used: usedTickets,
    },
    revenue: {
      total: totalRevenue,
      totalFormatted: `MWK ${totalRevenue.toLocaleString()}`,
      fees: totalFees,
      feesFormatted: `MWK ${totalFees.toLocaleString()}`,
      net: netRevenue,
      netFormatted: `MWK ${netRevenue.toLocaleString()}`,
      recent: recentRevenue,
      recentFormatted: `MWK ${recentRevenue.toLocaleString()}`,
    },
    topEvents: topEventsWithNames,
    weeklyGrowth,
  };
}

async function getWeeklyGrowth() {
  const weeks = [];
  const now = new Date();
  
  for (let i = 0; i < 12; i++) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (i * 7) - 7);
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - (i * 7));
    
    const newUsers = await prisma.user.count({
      where: { createdAt: { gte: weekStart, lt: weekEnd } },
    });
    
    const newEvents = await prisma.event.count({
      where: { createdAt: { gte: weekStart, lt: weekEnd } },
    });
    
    const ticketsSold = await prisma.ticket.count({
      where: { createdAt: { gte: weekStart, lt: weekEnd } },
    });
    
    weeks.unshift({
      week: `Week ${i + 1}`,
      startDate: weekStart.toISOString().split('T')[0],
      newUsers,
      newEvents,
      ticketsSold,
    });
  }
  
  return weeks;
}

async function getRecentActivity(limit: number = 20) {
  const activities = await prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: {
        select: { firstName: true, lastName: true, email: true, role: true },
      },
    },
  });
  
  return activities.map(activity => ({
    id: activity.id,
    action: activity.action,
    entity: activity.entity,
    user: activity.user ? {
      name: `${activity.user.firstName || ''} ${activity.user.lastName || ''}`.trim() || activity.user.email,
      role: activity.user.role,
    } : null,
    timestamp: activity.createdAt,
    timeAgo: getTimeAgo(activity.createdAt),
  }));
}

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

export const getAdminDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      return;
    }
    
    const cacheKey = 'admin_dashboard';
    const cached = metricsCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      res.status(200).json({ success: true, data: cached.data, cached: true });
      return;
    }
    
    const [systemHealth, activeUsers, platformMetrics, recentActivity] = await Promise.all([
      getSystemHealth(),
      getActiveUsersByRole(),
      getPlatformEventMetrics(),
      getRecentActivity(20),
    ]);
    
    const dashboardData = {
      timestamp: new Date().toISOString(),
      system: systemHealth,
      users: activeUsers,
      platform: platformMetrics,
      activity: recentActivity,
    };
    
    metricsCache.set(cacheKey, { data: dashboardData, expiresAt: Date.now() + CACHE_DURATION });
    
    res.status(200).json({ success: true, data: dashboardData, cached: false });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admin dashboard' });
  }
};

export const clearAdminCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      return;
    }
    
    metricsCache.clear();
    res.status(200).json({ success: true, message: 'Admin dashboard cache cleared' });
  } catch (error) {
    console.error('Clear admin cache error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear cache' });
  }
};

export const getSystemHealthOnly = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      return;
    }
    
    const systemHealth = await getSystemHealth();
    res.status(200).json({ success: true, data: systemHealth });
  } catch (error) {
    console.error('System health error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch system health' });
  }
};

// ======================
// 👥 Employee Management
// ======================

export const createEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      return;
    }

    const { userId, departmentId, organizationId, employeeId, jobTitle, grade, bankAccount, mobileMoney } = req.body;

    if (!userId || !departmentId || !organizationId || !employeeId || !jobTitle) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, departmentId, organizationId, employeeId, jobTitle',
      });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });

    if (!targetUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (targetUser.role !== 'EMPLOYEE') {
      res.status(400).json({
        success: false,
        message: `User role must be EMPLOYEE. Current role: ${targetUser.role}`,
      });
      return;
    }

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      res.status(404).json({ success: false, message: 'Department not found' });
      return;
    }

    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      res.status(404).json({ success: false, message: 'Organization not found' });
      return;
    }

    const existingEmployee = await prisma.employee.findUnique({ where: { userId: userId } });
    if (existingEmployee) {
      res.status(409).json({ success: false, message: 'Employee profile already exists for this user' });
      return;
    }

    const existingEmployeeId = await prisma.employee.findUnique({ where: { employeeId: employeeId } });
    if (existingEmployeeId) {
      res.status(409).json({ success: false, message: 'Employee ID already exists' });
      return;
    }

    const newEmployee = await prisma.employee.create({
      data: {
        userId,
        departmentId,
        organizationId,
        employeeId,
        jobTitle,
        grade: grade || null,
        bankAccount: bankAccount ? bankAccount : Prisma.JsonNull,
        mobileMoney: mobileMoney ? mobileMoney : Prisma.JsonNull,
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        department: true,
        organization: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'EMPLOYEE_CREATED',
        entity: 'Employee',
        entityId: newEmployee.id,
        newValue: { employeeId: newEmployee.employeeId, userId: targetUser.id },
        ipAddress: req.ip,
      },
    });

    res.status(201).json({ success: true, message: 'Employee profile created successfully', data: newEmployee });
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({ success: false, message: 'Failed to create employee profile' });
  }
};

export const updateEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      return;
    }

    const { id } = req.params;
    const { departmentId, organizationId, jobTitle, grade, bankAccount, mobileMoney } = req.body;

    const existingEmployee = await prisma.employee.findUnique({ where: { id: id } });
    if (!existingEmployee) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    if (departmentId) {
      const department = await prisma.department.findUnique({ where: { id: departmentId } });
      if (!department) {
        res.status(404).json({ success: false, message: 'Department not found' });
        return;
      }
    }

    if (organizationId) {
      const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!organization) {
        res.status(404).json({ success: false, message: 'Organization not found' });
        return;
      }
    }

    const updatedEmployee = await prisma.employee.update({
      where: { id: id },
      data: {
        departmentId: departmentId !== undefined ? departmentId : undefined,
        organizationId: organizationId !== undefined ? organizationId : undefined,
        jobTitle: jobTitle !== undefined ? jobTitle : undefined,
        grade: grade !== undefined ? grade : undefined,
        bankAccount: bankAccount !== undefined ? (bankAccount ? bankAccount : Prisma.JsonNull) : undefined,
        mobileMoney: mobileMoney !== undefined ? (mobileMoney ? mobileMoney : Prisma.JsonNull) : undefined,
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        department: true,
        organization: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'EMPLOYEE_UPDATED',
        entity: 'Employee',
        entityId: updatedEmployee.id,
        newValue: { employeeId: updatedEmployee.employeeId, updatedFields: Object.keys(req.body) },
        ipAddress: req.ip,
      },
    });

    res.status(200).json({ success: true, message: 'Employee profile updated successfully', data: updatedEmployee });
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ success: false, message: 'Failed to update employee profile' });
  }
};

export const getAllEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search as string;

    const whereCondition: any = {};

    if (search) {
      whereCondition.OR = [
        { employeeId: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [employees, totalCount] = await Promise.all([
      prisma.employee.findMany({
        where: whereCondition,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, createdAt: true } },
          department: true,
          organization: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.employee.count({ where: whereCondition }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        employees,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch employees' });
  }
};

export const getEmployeeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      return;
    }

    const { id } = req.params;

    const employee = await prisma.employee.findUnique({
      where: { id: id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, createdAt: true } },
        department: true,
        organization: true,
        dsaRequests: { orderBy: { submittedAt: 'desc' }, take: 10 },
      },
    });

    if (!employee) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    res.status(200).json({ success: true, data: employee });
  } catch (error) {
    console.error('Get employee by ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch employee' });
  }
};

export const deleteEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      return;
    }

    const { id } = req.params;

    const existingEmployee = await prisma.employee.findUnique({
      where: { id: id },
      include: { dsaRequests: { where: { status: { in: ['PENDING', 'APPROVED'] } } } },
    });

    if (!existingEmployee) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    if (existingEmployee.dsaRequests.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete employee with pending or approved DSA requests',
      });
      return;
    }

    await prisma.employee.delete({ where: { id: id } });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'EMPLOYEE_DELETED',
        entity: 'Employee',
        entityId: existingEmployee.id,
        newValue: { employeeId: existingEmployee.employeeId },
        ipAddress: req.ip,
      },
    });

    res.status(200).json({ success: true, message: 'Employee profile deleted successfully' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete employee profile' });
  }
};
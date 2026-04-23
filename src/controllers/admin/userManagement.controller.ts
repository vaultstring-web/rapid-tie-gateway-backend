import { Request, Response } from 'express';
import { prisma } from '../../server';
import bcrypt from 'bcrypt';

// Cache for user list
const userCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 60 * 1000; // 1 minute

// Get all users with pagination and filters
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
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

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const role = req.query.role as string;
    const status = req.query.status as string;
    const search = req.query.search as string;
    
    const skip = (page - 1) * limit;

    // Build filter conditions
    const whereCondition: any = {};
    
    if (role && role !== 'all') {
      whereCondition.role = role;
    }
    
    if (status === 'active') {
      whereCondition.emailVerified = true;
    } else if (status === 'inactive') {
      whereCondition.emailVerified = false;
    }
    
    if (search) {
      whereCondition.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get users with their data
    const users = await prisma.user.findMany({
      where: whereCondition,
      include: {
        merchant: true,
        organizer: true,
        employee: {
          include: {
            department: true,
            organization: true,
          },
        },
        approver: true,
        financeOfficer: true,
        admin: true,
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // Calculate stats for each user
    const usersWithStats = [];
    for (const user of users) {
      // Get ticket purchases
      const tickets = await prisma.ticket.findMany({
        where: {
          order: {
            customerEmail: user.email,
          },
        },
        include: {
          event: true,
          order: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      
      // Get event attendance history
      const attendedEvents = tickets.filter(t => t.status === 'USED').length;
      const purchasedTickets = tickets.length;
      const totalSpent = tickets.reduce((sum, t) => sum + (t.order?.totalAmount || 0), 0);
      
      // Get unique events attended
      const uniqueEvents = new Set(tickets.map(t => t.eventId));
      
      // Get last login
      const lastLogin = user.lastLoginAt;
      const lastSession = user.sessions[0];
      
      // Get account age
      const accountAge = Math.floor((new Date().getTime() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      
      usersWithStats.push({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        lastLoginAt: lastLogin,
        lastActivity: lastSession?.createdAt || lastLogin,
        accountAge: `${accountAge} days`,
        stats: {
          ticketsPurchased: purchasedTickets,
          eventsAttended: attendedEvents,
          uniqueEvents: uniqueEvents.size,
          totalSpent: totalSpent,
          totalSpentFormatted: `MWK ${totalSpent.toLocaleString()}`,
        },
        profile: {
          merchant: user.merchant,
          organizer: user.organizer,
          employee: user.employee,
        },
      });
    }

    const totalCount = await prisma.user.count({ where: whereCondition });
    const activeCount = await prisma.user.count({ where: { emailVerified: true } });
    const inactiveCount = await prisma.user.count({ where: { emailVerified: false } });
    
    const roleCounts = await prisma.user.groupBy({
      by: ['role'],
      _count: true,
    });

    const roleSummary: Record<string, number> = {};
    for (const rc of roleCounts) {
      roleSummary[rc.role] = rc._count;
    }

    const response = {
      users: usersWithStats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1,
      },
      summary: {
        total: totalCount,
        active: activeCount,
        inactive: inactiveCount,
        byRole: {
          ADMIN: roleSummary.ADMIN || 0,
          MERCHANT: roleSummary.MERCHANT || 0,
          ORGANIZER: roleSummary.ORGANIZER || 0,
          EMPLOYEE: roleSummary.EMPLOYEE || 0,
          APPROVER: roleSummary.APPROVER || 0,
          FINANCE_OFFICER: roleSummary.FINANCE_OFFICER || 0,
          PUBLIC: roleSummary.PUBLIC || 0,
        },
      },
    };

    // Cache the response
    const cacheKey = `users_${page}_${limit}_${role || 'all'}_${status || 'all'}_${search || 'none'}`;
    userCache.set(cacheKey, {
      data: response,
      expiresAt: Date.now() + CACHE_DURATION,
    });

    res.status(200).json({
      success: true,
      data: response,
      cached: false,
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
    });
  }
};

// Get user details by ID
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = (req as any).user;
    if (!admin || admin.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        merchant: {
          include: {
            settings: true,
            apiKeys: true,
            webhooks: true,
          },
        },
        organizer: {
          include: {
            events: {
              include: {
                ticketSales: true,
              },
            },
          },
        },
        employee: {
          include: {
            department: true,
            organization: true,
            dsaRequests: true,
          },
        },
        approver: {
          include: {
            approvals: true,
          },
        },
        financeOfficer: true,
        admin: true,
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        notifications: {
          where: { read: false },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Get ticket history
    const tickets = await prisma.ticket.findMany({
      where: {
        order: {
          customerEmail: user.email,
        },
      },
      include: {
        event: true,
        tier: true,
        order: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const attendedEvents = tickets.filter(t => t.status === 'USED');
    const upcomingEvents = tickets.filter(t => t.event.startDate > new Date() && t.status !== 'USED');
    
    // Get recent activity
    const recentActivity = await prisma.activityLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const response = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      passwordChangedAt: user.passwordChangedAt,
      stats: {
        totalTickets: tickets.length,
        attendedEvents: attendedEvents.length,
        upcomingEvents: upcomingEvents.length,
        totalSpent: tickets.reduce((sum, t) => sum + (t.order?.totalAmount || 0), 0),
        notificationsUnread: user.notifications.length,
        sessionsCount: user.sessions.length,
        activityCount: user.activityLogs.length,
      },
      tickets: {
        recent: tickets.slice(0, 10),
        attended: attendedEvents.slice(0, 10),
        upcoming: upcomingEvents.slice(0, 10),
      },
      recentActivity: recentActivity,
      profile: {
        merchant: user.merchant,
        organizer: user.organizer,
        employee: user.employee,
        approver: user.approver,
        financeOfficer: user.financeOfficer,
        admin: user.admin,
      },
    };

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details',
    });
  }
};

// Update user role
export const updateUserRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = (req as any).user;
    if (!admin || admin.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['PUBLIC', 'MERCHANT', 'ORGANIZER', 'EMPLOYEE', 'APPROVER', 'FINANCE_OFFICER', 'ADMIN', 'COMPLIANCE'];
    
    if (!role || !validRoles.includes(role)) {
      res.status(400).json({
        success: false,
        message: `Invalid role. Valid roles: ${validRoles.join(', ')}`,
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Don't allow changing the last admin's role
    if (user.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        res.status(400).json({
          success: false,
          message: 'Cannot change role of the last admin user',
        });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
    });

    // Log the role change
    await prisma.activityLog.create({
      data: {
        userId: admin.id,
        action: 'USER_ROLE_CHANGED',
        entity: 'User',
        entityId: user.id,
        oldValue: { role: user.role },
        newValue: { role, changedBy: admin.email },
      },
    });

    // Clear cache
    userCache.clear();

    res.status(200).json({
      success: true,
      message: `User role updated from ${user.role} to ${role}`,
      data: { id: updated.id, email: updated.email, role: updated.role },
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user role',
    });
  }
};

// Toggle account status (activate/suspend)
export const toggleAccountStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = (req as any).user;
    if (!admin || admin.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { id } = req.params;
    const { action } = req.body; // 'activate' or 'suspend'

    if (!action || !['activate', 'suspend'].includes(action)) {
      res.status(400).json({
        success: false,
        message: 'Action must be "activate" or "suspend"',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        merchant: true,
        organizer: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Don't allow suspending the last admin
    if (user.role === 'ADMIN' && action === 'suspend') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN', emailVerified: true },
      });
      if (adminCount <= 1) {
        res.status(400).json({
          success: false,
          message: 'Cannot suspend the last active admin user',
        });
        return;
      }
    }

    const isActive = action === 'activate';
    
    // Update user email verified status
    const updated = await prisma.user.update({
      where: { id },
      data: { 
        emailVerified: isActive,
      },
    });

    // Update related merchant/organizer status if they exist
    if (user.role === 'MERCHANT' && user.merchant) {
      await prisma.merchant.update({
        where: { id: user.merchant.id },
        data: { status: isActive ? 'ACTIVE' : 'SUSPENDED' },
      }).catch(err => console.error('Error updating merchant status:', err));
    }
    
    if (user.role === 'ORGANIZER' && user.organizer) {
      await prisma.eventOrganizer.update({
        where: { id: user.organizer.id },
        data: { status: isActive ? 'ACTIVE' : 'SUSPENDED' },
      }).catch(err => console.error('Error updating organizer status:', err));
    }

    // Log the status change
    await prisma.activityLog.create({
      data: {
        userId: admin.id,
        action: action === 'activate' ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
        entity: 'User',
        entityId: user.id,
        newValue: { status: action, changedBy: admin.email },
      },
    });

    // Clear cache
    userCache.clear();

    res.status(200).json({
      success: true,
      message: `User ${action}d successfully`,
      data: { id: updated.id, email: updated.email, status: isActive ? 'ACTIVE' : 'SUSPENDED' },
    });
  } catch (error) {
    console.error('Toggle account status error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update account status',
    });
  }
};
// Reset user password (admin action)
export const resetUserPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = (req as any).user;
    if (!admin || admin.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const updated = await prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    });

    // Log the password reset
    await prisma.activityLog.create({
      data: {
        userId: admin.id,
        action: 'USER_PASSWORD_RESET',
        entity: 'User',
        entityId: user.id,
        newValue: { resetBy: admin.email },
      },
    });

    // Clear cache
    userCache.clear();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
      data: { id: updated.id, email: updated.email },
    });
  } catch (error) {
    console.error('Reset user password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
    });
  }
};

// Delete user
// Delete user
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = (req as any).user;
    if (!admin || admin.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        merchant: true,
        organizer: true,
        employee: true,
        approver: true,
        financeOfficer: true,
        admin: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Don't allow deleting the last admin
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        res.status(400).json({
          success: false,
          message: 'Cannot delete the last admin user',
        });
        return;
      }
    }

    // Don't allow deleting self
    if (user.id === admin.id) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete your own account',
      });
      return;
    }

    // Delete related records first to avoid foreign key constraints
    try {
      // Delete sessions
      await prisma.session.deleteMany({
        where: { userId: user.id },
      });

      // Delete notifications
      await prisma.notification.deleteMany({
        where: { userId: user.id },
      });

      // Delete activity logs
      await prisma.activityLog.deleteMany({
        where: { userId: user.id },
      });

      // Delete networking related records
      await prisma.message.deleteMany({
        where: {
          OR: [
            { fromUserId: user.id },
            { toUserId: user.id },
          ],
        },
      });

      await prisma.connection.deleteMany({
        where: {
          OR: [
            { fromUserId: user.id },
            { toUserId: user.id },
          ],
        },
      });

      await prisma.networkingProfile.deleteMany({
        where: { userId: user.id },
      });

      // Delete communication opt-outs
      await prisma.communicationOptOut.deleteMany({
        where: { userId: user.id },
      });

      // Delete communication recipients
      await prisma.communicationRecipient.deleteMany({
        where: { userId: user.id },
      });

      // Delete notification preferences
      await prisma.notificationPreferences.deleteMany({
        where: { userId: user.id },
      });

      // Delete role-specific records
      if (user.merchant) {
        // Delete merchant related records
        await prisma.apiKey.deleteMany({
          where: { merchantId: user.merchant.id },
        });
        await prisma.webhook.deleteMany({
          where: { merchantId: user.merchant.id },
        });
        await prisma.paymentLink.deleteMany({
          where: { merchantId: user.merchant.id },
        });
        await prisma.product.deleteMany({
          where: { merchantId: user.merchant.id },
        });
        await prisma.order.deleteMany({
          where: { merchantId: user.merchant.id },
        });
        await prisma.merchantSettings.deleteMany({
          where: { merchantId: user.merchant.id },
        });
        await prisma.merchant.delete({
          where: { id: user.merchant.id },
        });
      }

      if (user.organizer) {
        // Delete organizer related records
        await prisma.event.deleteMany({
          where: { organizerId: user.organizer.id },
        });
        await prisma.ticketSale.deleteMany({
          where: { organizerId: user.organizer.id },
        });
        await prisma.transaction.updateMany({
          where: { organizerId: user.organizer.id },
          data: { organizerId: null },
        });
        await prisma.settlement.updateMany({
          where: { organizerId: user.organizer.id },
          data: { organizerId: null },
        });
        await prisma.eventOrganizer.delete({
          where: { id: user.organizer.id },
        });
      }

      if (user.employee) {
        await prisma.dsaRequest.updateMany({
          where: { employeeId: user.employee.id },
          data: { employeeId: "" },
        });
        await prisma.employee.delete({
          where: { id: user.employee.id },
        });
      }

      if (user.approver) {
        await prisma.approval.updateMany({
          where: { approverId: user.approver.id },
          data: { approverId: "" },
        });
        await prisma.approver.delete({
          where: { id: user.approver.id },
        });
      }

      if (user.financeOfficer) {
        await prisma.disbursementBatch.updateMany({
          where: { financeOfficerId: user.financeOfficer.id },
          data: { financeOfficerId: "" },
        });
        await prisma.financeOfficer.delete({
          where: { id: user.financeOfficer.id },
        });
      }

      if (user.admin) {
        await prisma.admin.delete({
          where: { id: user.admin.id },
        });
      }

      // Finally delete the user
      await prisma.user.delete({
        where: { id: user.id },
      });

    } catch (deleteError) {
      console.error('Error deleting related records:', deleteError);
      // If cascade delete fails, try a simpler approach - just delete the user
      // Prisma might handle cascade if schema has onDelete: Cascade
      await prisma.user.delete({
        where: { id: user.id },
      });
    }

    // Log the deletion
    await prisma.activityLog.create({
      data: {
        userId: admin.id,
        action: 'USER_DELETED',
        entity: 'User',
        entityId: user.id,
        newValue: { deletedBy: admin.email, deletedEmail: user.email },
      },
    });

    // Clear cache
    userCache.clear();

    res.status(200).json({
      success: true,
      message: `User ${user.email} deleted successfully`,
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete user',
    });
  }
};

// Clear user cache
export const clearUserCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = (req as any).user;
    if (!admin || admin.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    userCache.clear();
    res.status(200).json({
      success: true,
      message: 'User cache cleared',
    });
  } catch (error) {
    console.error('Clear user cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
    });
  }
};

// Get user attendance history
export const getUserAttendanceHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = (req as any).user;
    if (!admin || admin.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { id } = req.params;

    const tickets = await prisma.ticket.findMany({
      where: {
        order: {
          customerEmail: (await prisma.user.findUnique({ where: { id } }))?.email,
        },
      },
      include: {
        event: {
          include: {
            organizer: true,
          },
        },
        tier: true,
        order: true,
      },
      orderBy: { event: { startDate: 'desc' } },
    });

    const history = {
      total: tickets.length,
      attended: tickets.filter(t => t.status === 'USED').length,
      upcoming: tickets.filter(t => t.event.startDate > new Date() && t.status !== 'USED').length,
      cancelled: tickets.filter(t => t.status === 'CANCELLED').length,
      events: tickets.map(t => ({
        eventId: t.event.id,
        eventName: t.event.name,
        eventDate: t.event.startDate,
        venue: t.event.venue,
        city: t.event.city,
        ticketType: t.tier.name,
        status: t.status,
        checkedInAt: t.checkedInAt,
        amount: t.order.totalAmount,
      })),
    };

    res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Get user attendance history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance history',
    });
  }
};
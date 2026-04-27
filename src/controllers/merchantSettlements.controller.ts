import { Request, Response } from 'express';
import { prisma } from '../server';

export const listMerchantSettlements = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'MERCHANT') {
      res.status(403).json({ success: false, message: 'Access denied. Merchant privileges required.' });
      return;
    }

    const merchant = await prisma.merchant.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!merchant) {
      res.status(404).json({ success: false, message: 'Merchant profile not found' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const status = (req.query.status as string) || undefined;

    const where: any = { merchantId: merchant.id };
    if (status && status !== 'all') where.status = status;

    const [items, total] = await Promise.all([
      prisma.settlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.settlement.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        settlements: items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('List merchant settlements error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settlements' });
  }
};


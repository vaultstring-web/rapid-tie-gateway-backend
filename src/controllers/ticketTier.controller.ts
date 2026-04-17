import { Request, Response, NextFunction } from "express";
import { prisma } from '../server';
export const createTicketTier = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: eventId } = req.params;

    const {
      name,
      description,
      price,
      quantity,
      maxPerCustomer,
      startSale,
      endSale,
      rolePricing
    } = req.body;

    const tier = await prisma.ticketTier.create({
      data: {
        eventId,
        name,
        description,
        price,
        quantity,
        maxPerCustomer,
        startSale: startSale ? new Date(startSale) : null,
        endSale: endSale ? new Date(endSale) : null,
        rolePricing
      }
    });

    res.status(201).json({
      success: true,
      data: tier
    });

  } catch (error) {
    next(error);
  }
};
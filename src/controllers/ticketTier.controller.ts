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

export const updateTicketTier = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { tierId } = req.params;
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

    const tier = await prisma.ticketTier.update({
      where: { id: tierId },
      data: {
        name,
        description,
        price,
        quantity,
        maxPerCustomer,
        startSale: startSale ? new Date(startSale) : undefined,
        endSale: endSale ? new Date(endSale) : undefined,
        rolePricing
      }
    });

    res.status(200).json({
      success: true,
      data: tier
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTicketTier = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { tierId } = req.params;
    await prisma.ticketTier.delete({
      where: { id: tierId }
    });
    res.status(200).json({
      success: true,
      message: "Ticket tier deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};
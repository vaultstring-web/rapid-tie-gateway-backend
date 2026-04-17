import { Request, Response, NextFunction } from "express";
import { validateTicketsService } from "../services/tickets.service";
import { prisma } from "../server";

export const validateTickets = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { tierId, quantity, purchaserRole } = req.body;

    const data = await validateTicketsService(
      tierId,
      quantity,
      purchaserRole
    );

    res.status(200).json({
      status: "success",
      data
    });

  } catch (error) {
    next(error);
  }
};
export const getEventTiers = async (
  req: Request,
  res: Response,
  next: NextFunction
):Promise<void> => {
  try {
    const { id: eventId } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        ticketTiers: {
          orderBy: {
            price: 'asc'
          }
        },
        organizer: {
          select: {
            organizationName: true
          }
        }
      }
    });

    if (!event) {
    res.status(404).json({
        success: false,
        message: "Event not found"
      });
      return;
    }

    // Calculate available tickets for each tier
    const tiersWithAvailability = event.ticketTiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      description: tier.description,
      price: tier.price,
      quantity: tier.quantity,
      sold: tier.sold,
      available: tier.quantity - tier.sold,
      isAvailable: (tier.quantity - tier.sold) > 0,
      maxPerCustomer: tier.maxPerCustomer,
      startSale: tier.startSale,
      endSale: tier.endSale
    }));

    res.status(200).json({
      success: true,
      data: {
        event: {
          id: event.id,
          name: event.name,
          description: event.description,
          shortDescription: event.shortDescription,
          startDate: event.startDate,
          endDate: event.endDate,
          venue: event.venue,
          city: event.city,
          coverImage: event.coverImage,
          organizer: event.organizer
        },
        tiers: tiersWithAvailability
      }
    });
return;
  } catch (error) {
    next(error);
  }
};
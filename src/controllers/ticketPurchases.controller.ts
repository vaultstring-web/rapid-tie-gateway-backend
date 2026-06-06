import { Request, Response } from "express";
import { prisma } from '../server';
import { v4 as uuidv4 } from "uuid";
import { paymentService } from "../services/payment.service";
import { acquireLock, getActiveLocksForTier, releaseLock } from "../services/inventoryLock.service";

export const purchaseTickets = async (
  req: Request,
  res: Response
): Promise<void> => {
  const sessionToken = uuidv4();
  try {
    const { id: eventId } = req.params;
    const { tierId, quantity, customerName, customerEmail, customerPhone } = req.body;

    if (!tierId || !quantity || !customerName || !customerEmail) {
      res.status(400).json({ success: false, message: "Missing required fields" });
      return;
    }

    const user = (req as any).user;
    const purchaserRole = user?.role || "PUBLIC";

    // Find event and ticket tiers
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTiers: true, organizer: true },
    });

    if (!event) {
      res.status(404).json({ success: false, message: "Event not found" });
      return;
    }

    const tier = event.ticketTiers.find(t => t.id === tierId);

    if (!tier) {
      res.status(404).json({ success: false, message: "Ticket tier not found" });
      return;
    }

    // Check availability including active inventory locks
    const activeLocks = await getActiveLocksForTier(tierId);

    if (tier.sold + quantity + activeLocks > tier.quantity) {
      res.status(400).json({ success: false, message: "Not enough tickets available" });
      return;
    }

    // Lock tickets for 15 minutes
    const lockAcquired = await acquireLock({
      tierId,
      quantity,
      sessionToken,
      ttlSeconds: 15 * 60
    });

    if (!lockAcquired) {
      res.status(409).json({ success: false, message: "Inventory lock already held, please try again" });
      return;
    }

    const feePercentage = 0.03;
    const totalAmount = tier.price * quantity;
    const feeAmount = totalAmount * feePercentage;
    const netAmount = totalAmount - feeAmount;

    // Create TicketSale with status RESERVED
    const sale = await prisma.ticketSale.create({
      data: {
        organizerId: event.organizerId,
        eventId: event.id,
        orderNumber: `ORD-${Date.now()}`,
        customerName,
        customerEmail,
        customerPhone,
        totalAmount,
        feeAmount,
        netAmount,
        status: "RESERVED",
        paymentMethod: "pending",
      },
    });

    // Create payment session - DO NOT SKIP THIS!
    await paymentService.createPaymentSession(
      eventId,
      tierId,
      quantity,
      totalAmount,
      sessionToken,
      sale.id // Pass the order ID to link payment session to order
    );

    // Return response (no tickets yet, they get created after payment)
    res.status(201).json({
      success: true,
      data: {
        order: sale,
        sessionToken,
        purchaserRole,
        paymentSession: {
          token: sessionToken,
          amount: totalAmount,
          currency: "MWK",
          expiresIn: "15 minutes"
        }
      },
    });

  } catch (error) {
    // Release lock on error
    await releaseLock(sessionToken);
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
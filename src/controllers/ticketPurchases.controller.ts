import { Request, Response } from "express";
import { prisma } from '../server';
import { v4 as uuidv4 } from "uuid";
import { paymentService } from "../services/payment.service";

// Helper to lock inventory (in-memory for demo)
const inventoryLocks: Record<string, { tierId: string; expiresAt: number }> = {};

// Lock a ticket tier for a session
function lockInventory(sessionToken: string, tierId: string, durationMs: number) {
  inventoryLocks[sessionToken] = { tierId, expiresAt: Date.now() + durationMs };
  return inventoryLocks[sessionToken];
}

// Periodically remove expired locks (every 1 minute)
setInterval(() => {
  const now = Date.now();
  for (const token in inventoryLocks) {
    if (inventoryLocks[token].expiresAt < now) {
      delete inventoryLocks[token];
    }
  }
}, 60_000);

export const purchaseTickets = async (
  req: Request,
  res: Response
): Promise<void> => {
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
    const activeLocks = Object.values(inventoryLocks)
      .filter(lock => lock.tierId === tierId && lock.expiresAt > Date.now()).length;

    if (tier.sold + quantity + activeLocks > tier.quantity) {
      res.status(400).json({ success: false, message: "Not enough tickets available" });
      return;
    }

    // Lock tickets for 15 minutes
    const sessionToken = uuidv4();
    lockInventory(sessionToken, tierId, 15 * 60 * 1000);

    const feePercentage = 0.03;
    const totalAmount = tier.price * quantity;
    const feeAmount = totalAmount * feePercentage;
    const netAmount = totalAmount - feeAmount;

    // Create TicketSale (existing functionality - KEPT)
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
        status: "completed",
        paymentMethod: "pending",
      },
    });

    // Create individual tickets with unique IDs and QR codes (existing functionality - KEPT)
    const tickets = await Promise.all(
      Array.from({ length: quantity }).map(async () => {
        const ticketID = uuidv4();
        const qr = uuidv4();
        return await prisma.ticket.create({
          data: {
            id: ticketID,
            eventId: event.id,
            tierId: tier.id,
            orderId: sale.id,
            attendeeName: customerName,
            attendeeEmail: customerEmail,
            attendeePhone: customerPhone,
            qrCode: qr,
            qrCodeData: JSON.stringify({ ticketId: ticketID, eventId: event.id, tierId: tier.id }),
          },
        });
      })
    );

    // Update tier sold count (existing functionality - KEPT)
    await prisma.ticketTier.update({
      where: { id: tier.id },
      data: { sold: { increment: quantity } },
    });

    // NEW: Create payment session (doesn't affect existing flow)
    // This runs in parallel but doesn't block the response if it fails
    try {
      await paymentService.createPaymentSession(
        eventId,
        tierId,
        quantity,
        totalAmount,
        sessionToken,
        sale.id // Pass the order ID to link payment session to order
      );
    } catch (paymentSessionError) {
      // Log error but don't break the existing flow
      console.error("Failed to create payment session:", paymentSessionError);
      // The ticket sale is already completed, so we just log the error
    }

    // Return EXACT same response as before (plus optional payment session info)
    res.status(201).json({
      success: true,
      data: {
        order: sale,
        tickets,
        sessionToken,
        purchaserRole,
        // NEW: Optional payment session info (doesn't break existing clients)
        paymentSession: {
          token: sessionToken,
          amount: totalAmount,
          currency: "MWK",
          expiresIn: "15 minutes"
        }
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
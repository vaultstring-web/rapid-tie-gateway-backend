import crypto from "crypto";
import { prisma } from '../server';
import { acquireLock, getLock, getActiveLocksForTier } from "../services/inventoryLock.service";
import { v4 as uuidv4 } from "uuid";

export const validateTicketsService = async (
  tierId: string,
  quantity: number,
  purchaserRole?: string
) => {
  const tier = await prisma.ticketTier.findUnique({
    where: { id: tierId },
    include: { event: true }
  });

  if (!tier) {
    throw new Error("Ticket tier not found");
  }

  const activeLocks = await getActiveLocksForTier(tierId);

  if (tier.sold + quantity + activeLocks > tier.quantity) {
    throw new Error("Not enough tickets available");
  }

  // create session token
  const sessionToken = crypto.randomBytes(16).toString("hex");

  // lock inventory for 15 minutes
  const lockAcquired = await acquireLock({
    tierId,
    quantity,
    sessionToken,
    ttlSeconds: 15 * 60
  });

  if (!lockAcquired) {
    throw new Error("Failed to acquire inventory lock, please try again");
  }

  // calculate fees (5%)
  const subtotal = tier.price * quantity;
  const fee = subtotal * 0.05;
  const total = subtotal + fee;

  return {
    sessionToken,
    expiresIn: "15 minutes",
    tier: tier.name,
    quantity,
    subtotal,
    fee,
    total,
    purchaserRole
  };
};

export const finalizeSale = async (sessionToken: string) => {
  // Get lock data
  const lockData = await getLock(sessionToken);
  if (!lockData) {
    throw new Error("Invalid or expired session");
  }

  // Find payment session and associated order
  const paymentSession = await prisma.paymentSession.findUnique({
    where: { sessionToken },
    include: { order: true, tier: true, event: true }
  });

  if (!paymentSession) {
    throw new Error("Payment session not found");
  }

  const order = paymentSession.order;
  if (!order) {
    throw new Error("Order not found");
  }

  // Check if order is already completed
  if (order.status === "COMPLETED") {
    return { order, tickets: [] };
  }

  // Perform atomic transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update order status to COMPLETED
    const updatedOrder = await tx.ticketSale.update({
      where: { id: order.id },
      data: { status: "COMPLETED" }
    });

    // Increment tier sold count
    await tx.ticketTier.update({
      where: { id: lockData.tierId },
      data: { sold: { increment: lockData.quantity } }
    });

    // Create ticket records
    const tickets = await Promise.all(
      Array.from({ length: lockData.quantity }).map(async () => {
        const ticketID = uuidv4();
        const qr = uuidv4();
        return await tx.ticket.create({
          data: {
            id: ticketID,
            eventId: paymentSession.eventId,
            tierId: lockData.tierId,
            orderId: updatedOrder.id,
            attendeeName: updatedOrder.customerName,
            attendeeEmail: updatedOrder.customerEmail,
            attendeePhone: updatedOrder.customerPhone,
            qrCode: qr,
            qrCodeData: JSON.stringify({ ticketId: ticketID, eventId: paymentSession.eventId, tierId: lockData.tierId }),
          },
        });
      })
    );

    return { order: updatedOrder, tickets };
  });

  return result;
};
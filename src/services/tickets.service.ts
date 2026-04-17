import crypto from "crypto";
import { prisma } from '../server';
import { createLock } from "../utils/inventoryLock";

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

  const available = tier.quantity - tier.sold;

  if (quantity > available) {
    throw new Error("Not enough tickets available");
  }

  // create session token
  const sessionToken = crypto.randomBytes(16).toString("hex");

  // lock inventory for 15 minutes
  createLock(sessionToken, {
    tierId,
    quantity,
    purchaserRole,
    expiresAt: Date.now() + 15 * 60 * 1000
  });

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
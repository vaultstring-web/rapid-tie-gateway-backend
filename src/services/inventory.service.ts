import { Prisma } from '@prisma/client';

/**
 * Atomically allocates tickets by conditionally incrementing the sold count
 * only if sufficient capacity remains.  This prevents overselling under
 * concurrent load because the WHERE clause acts as a compare-and-swap guard:
 *
 *   UPDATE "TicketTier"
 *   SET    sold = sold + :quantity
 *   WHERE  id = :tierId
 *   AND    sold <= (quantity - :requestedQty)   -- still has room
 *
 * If another transaction has already consumed the remaining capacity the
 * WHERE clause won't match and `updateMany` returns `{ count: 0 }`.
 *
 * @param tx       - Prisma transaction client (must run inside $transaction)
 * @param tierId   - The ticket tier to allocate from
 * @param quantity - Number of tickets to allocate
 * @throws Error   - "Not enough tickets available" when capacity is exhausted
 */
export async function allocateTickets(
  tx: Prisma.TransactionClient,
  tierId: string,
  quantity: number
): Promise<void> {
  // Fetch the tier's total capacity so we can compute the headroom threshold.
  const tier = await tx.ticketTier.findUnique({
    where: { id: tierId },
    select: { quantity: true },
  });

  if (!tier) {
    throw new Error('Ticket tier not found');
  }

  // Single conditional update – this is the atomic compare-and-swap.
  // The `lte` guard ensures `sold` can only be incremented while
  // `sold + requestedQuantity <= tier.quantity`.
  const result = await tx.ticketTier.updateMany({
    where: {
      id: tierId,
      sold: { lte: tier.quantity - quantity },
    },
    data: {
      sold: { increment: quantity },
    },
  });

  if (result.count === 0) {
    throw new Error('Not enough tickets available');
  }
}

/**
 * FIFO Allocation Logic — PostgreSQL
 *
 * Allocates USD/USDT expenses to topup batches in FIFO order.
 */

import { query, queryRows, queryOne } from './postgres.js';

/**
 * Allocate a transaction amount against topup batches (oldest first)
 * @returns {{ costIdr: number|null, avgRate: number|null }}
 */
export async function allocateFifo(transactionId, paymentMethodId, amount) {
  const batches = await queryRows(`
    SELECT id, remaining_amount, exchange_rate, total_idr
    FROM balance_adjustments
    WHERE payment_method_id = $1
      AND exchange_rate IS NOT NULL
      AND remaining_amount > 0
    ORDER BY adjustment_date ASC, id ASC
  `, [paymentMethodId]);

  let remaining = parseFloat(amount);
  let totalCostIdr = 0;

  for (const batch of batches) {
    if (remaining <= 0) break;

    const available = parseFloat(batch.remaining_amount);
    const consume = Math.min(remaining, available);
    const rate = parseFloat(batch.exchange_rate);
    const costIdr = consume * rate;

    // Create allocation record
    await query(
      'INSERT INTO fifo_allocations (transaction_id, adjustment_id, amount) VALUES ($1, $2, $3)',
      [transactionId, batch.id, consume]
    );

    // Reduce batch remaining
    await query(
      'UPDATE balance_adjustments SET remaining_amount = remaining_amount - $1 WHERE id = $2',
      [consume, batch.id]
    );

    totalCostIdr += costIdr;
    remaining -= consume;
  }

  if (totalCostIdr === 0) return { costIdr: null, avgRate: null };

  const consumed = parseFloat(amount) - remaining;
  const avgRate = consumed > 0 ? Math.round((totalCostIdr / consumed) * 100) / 100 : null;

  return {
    costIdr: Math.round(totalCostIdr),
    avgRate,
  };
}

/**
 * Reverse all FIFO allocations for a transaction
 */
export async function reverseFifo(transactionId) {
  const allocations = await queryRows(
    'SELECT adjustment_id, amount FROM fifo_allocations WHERE transaction_id = $1',
    [transactionId]
  );

  for (const alloc of allocations) {
    await query(
      'UPDATE balance_adjustments SET remaining_amount = remaining_amount + $1 WHERE id = $2',
      [alloc.amount, alloc.adjustment_id]
    );
  }

  await query('DELETE FROM fifo_allocations WHERE transaction_id = $1', [transactionId]);
}

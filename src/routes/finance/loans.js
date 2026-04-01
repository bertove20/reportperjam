/**
 * Finance Loans — CRUD + repayment
 */

import { query, queryRows, queryOne } from '../../storage/postgres.js';
import { requireEdit } from '../../middleware/auth.js';
import { tWhere } from '../../middleware/tenant-scope.js';

export default async function (app) {
  app.get('/api/finance/loans', async (request) => {
    const tid = request.tenantId;
    const loans = await queryRows(`
      SELECT l.*, tm.name as team_name, pm.name as pm_name, pm.currency,
        bk.name as bank_name, u.username as created_by_name
      FROM loans l
      LEFT JOIN teams tm ON l.team_id = tm.id
      LEFT JOIN payment_methods pm ON l.payment_method_id = pm.id
      LEFT JOIN banks bk ON pm.bank_id = bk.id
      LEFT JOIN users u ON l.created_by = u.id
      WHERE l.tenant_id = $1
      ORDER BY l.loan_date DESC
    `, [tid]);

    const summary = await queryOne(`
      SELECT
        COALESCE(SUM(amount), 0) as total_loaned,
        COALESCE(SUM(repaid_amount), 0) as total_repaid,
        COALESCE(SUM(amount - repaid_amount), 0) as total_outstanding,
        COUNT(*) FILTER (WHERE status = 'active') as active_count,
        COUNT(*) FILTER (WHERE status = 'partial') as partial_count,
        COUNT(*) FILTER (WHERE status = 'repaid') as repaid_count
      FROM loans
      WHERE tenant_id = $1
    `, [tid]);

    return { loans, summary };
  });

  app.get('/api/finance/loans/:id', async (request) => {
    const tid = request.tenantId;
    const loan = await queryOne(`
      SELECT l.*, tm.name as team_name, pm.name as pm_name, pm.currency
      FROM loans l
      LEFT JOIN teams tm ON l.team_id = tm.id
      LEFT JOIN payment_methods pm ON l.payment_method_id = pm.id
      WHERE l.id = $1 AND l.tenant_id = $2
    `, [request.params.id, tid]);

    const repayments = await queryRows(
      'SELECT * FROM balance_adjustments WHERE loan_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
      [request.params.id, tid]
    );

    return { loan, repayments };
  });

  app.post('/api/finance/loans', { preHandler: [requireEdit()] }, async (request) => {
    const tid = request.tenantId;
    const { team_id, payment_method_id, amount, description, loan_date } = request.body;
    const amountNum = parseFloat(amount);

    const result = await query(`
      INSERT INTO loans (team_id, payment_method_id, amount, description, loan_date, created_by, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
    `, [team_id, payment_method_id, amountNum, description || null, loan_date || new Date().toISOString().split('T')[0], request.user.id, tid]);

    // Deduct from wallet
    await query('UPDATE payment_methods SET current_balance = current_balance - $1 WHERE id = $2 AND tenant_id = $3', [amountNum, payment_method_id, tid]);

    return { success: true, id: result.rows[0].id };
  });

  app.post('/api/finance/loans/:id/repay', { preHandler: [requireEdit()] }, async (request) => {
    const tid = request.tenantId;
    const { amount, payment_method_id, description } = request.body;
    const amountNum = parseFloat(amount);
    const loan = await queryOne('SELECT * FROM loans WHERE id = $1 AND tenant_id = $2', [request.params.id, tid]);
    if (!loan) return { error: 'Loan not found' };

    const remaining = parseFloat(loan.amount) - parseFloat(loan.repaid_amount);
    if (amountNum > remaining) return { error: `Max repayment: ${remaining}` };

    const pmId = payment_method_id || loan.payment_method_id;
    const today = new Date().toISOString().split('T')[0];

    // Add balance adjustment
    await query(`
      INSERT INTO balance_adjustments (payment_method_id, amount, type, description, adjustment_date, loan_id, created_by, tenant_id)
      VALUES ($1, $2, 'loan_repayment', $3, $4, $5, $6, $7)
    `, [pmId, amountNum, description || 'Loan repayment', today, request.params.id, request.user.id, tid]);

    // Restore wallet balance
    await query('UPDATE payment_methods SET current_balance = current_balance + $1 WHERE id = $2 AND tenant_id = $3', [amountNum, pmId, tid]);

    // Update loan
    const newRepaid = parseFloat(loan.repaid_amount) + amountNum;
    const newStatus = newRepaid >= parseFloat(loan.amount) ? 'repaid' : 'partial';
    await query('UPDATE loans SET repaid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4',
      [newRepaid, newStatus, request.params.id, tid]);

    return { success: true, newStatus };
  });

  app.delete('/api/finance/loans/:id', { preHandler: [requireEdit()] }, async (request) => {
    if (request.user.role !== 'superadmin') return { error: 'Superadmin only' };

    const tid = request.tenantId;
    const loan = await queryOne('SELECT * FROM loans WHERE id = $1 AND tenant_id = $2', [request.params.id, tid]);
    if (!loan) return { error: 'Not found' };

    // Reverse repayments
    const repayments = await queryRows('SELECT * FROM balance_adjustments WHERE loan_id = $1 AND tenant_id = $2', [request.params.id, tid]);
    for (const rep of repayments) {
      await query('UPDATE payment_methods SET current_balance = current_balance - $1 WHERE id = $2 AND tenant_id = $3', [rep.amount, rep.payment_method_id, tid]);
    }
    await query('DELETE FROM balance_adjustments WHERE loan_id = $1 AND tenant_id = $2', [request.params.id, tid]);

    // Restore original loan amount
    await query('UPDATE payment_methods SET current_balance = current_balance + $1 WHERE id = $2 AND tenant_id = $3', [loan.amount, loan.payment_method_id, tid]);

    await query('DELETE FROM loans WHERE id = $1 AND tenant_id = $2', [request.params.id, tid]);
    return { success: true };
  });
}

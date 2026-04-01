/**
 * Finance Dashboard — summary stats
 */

import { queryRows, queryOne } from '../../storage/postgres.js';
import { addDivisionFilter } from '../../utils/division-filter.js';
import { tWhere } from '../../middleware/tenant-scope.js';

export default async function (app) {
  app.get('/api/finance/dashboard', async (request) => {
    const tid = request.tenantId;
    const { month, year } = request.query;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();
    const user = request.user;

    const { where: divFilter, params: divParams } = addDivisionFilter(user);

    // Total expense this month
    const expenseUsd = await queryOne(`
      SELECT COALESCE(SUM(CASE WHEN currency='USD' OR currency='USDT' THEN amount ELSE 0 END), 0) as total_usd,
             COALESCE(SUM(CASE WHEN currency='IDR' THEN amount ELSE 0 END), 0) as total_idr
      FROM transactions t
      LEFT JOIN finance_brands b ON t.brand_id = b.id
      WHERE EXTRACT(MONTH FROM transaction_date) = $1 AND EXTRACT(YEAR FROM transaction_date) = $2
      AND t.tenant_id = $3
      ${divFilter.replace('division_id', 'b.division_id')}
    `, [m, y, tid, ...divParams]);

    // Budget this month
    const budget = await queryOne(`
      SELECT COALESCE(SUM(budget_amount), 0) as total_budget,
             COALESCE(SUM(budget_idr), 0) as total_budget_idr
      FROM brand_budgets bb
      LEFT JOIN finance_brands b ON bb.brand_id = b.id
      WHERE bb.month = $1 AND bb.year = $2
      AND bb.tenant_id = $3
      ${divFilter.replace('division_id', 'b.division_id')}
    `, [m, y, tid, ...divParams]);

    // Expense by brand
    const byBrand = await queryRows(`
      SELECT b.id, b.name,
        COALESCE(SUM(CASE WHEN t.currency='USD' OR t.currency='USDT' THEN t.amount ELSE 0 END), 0) as expense_usd,
        COALESCE(SUM(CASE WHEN t.currency='IDR' THEN t.amount ELSE 0 END), 0) as expense_idr,
        COUNT(t.id) as tx_count
      FROM finance_brands b
      LEFT JOIN transactions t ON t.brand_id = b.id
        AND EXTRACT(MONTH FROM t.transaction_date) = $1
        AND EXTRACT(YEAR FROM t.transaction_date) = $2
      WHERE b.is_active = 1 AND b.tenant_id = $3 ${divFilter.replace('division_id', 'b.division_id')}
      GROUP BY b.id, b.name ORDER BY expense_usd DESC
    `, [m, y, tid, ...divParams]);

    // By payment method
    const byPayment = await queryRows(`
      SELECT pm.name, bk.name as bank_name, pm.currency,
        COALESCE(SUM(t.amount), 0) as total,
        COUNT(t.id) as tx_count
      FROM transactions t
      JOIN payment_methods pm ON t.payment_method_id = pm.id
      JOIN banks bk ON pm.bank_id = bk.id
      WHERE EXTRACT(MONTH FROM t.transaction_date) = $1 AND EXTRACT(YEAR FROM t.transaction_date) = $2
      AND t.tenant_id = $3
      GROUP BY pm.id, pm.name, bk.name, pm.currency ORDER BY total DESC
    `, [m, y, tid]);

    // By team
    const byTeam = await queryRows(`
      SELECT tm.name,
        COALESCE(SUM(CASE WHEN t.currency='USD' OR t.currency='USDT' THEN t.amount ELSE 0 END), 0) as expense_usd,
        COALESCE(SUM(CASE WHEN t.currency='IDR' THEN t.amount ELSE 0 END), 0) as expense_idr,
        COUNT(t.id) as tx_count
      FROM transactions t
      LEFT JOIN teams tm ON t.team_id = tm.id
      WHERE EXTRACT(MONTH FROM t.transaction_date) = $1 AND EXTRACT(YEAR FROM t.transaction_date) = $2
      AND t.tenant_id = $3
      GROUP BY tm.id, tm.name ORDER BY expense_usd DESC
    `, [m, y, tid]);

    // Payment balances
    const balances = await queryRows(`
      SELECT pm.id, pm.name, pm.current_balance, pm.initial_balance, pm.currency, bk.name as bank_name
      FROM payment_methods pm
      JOIN banks bk ON pm.bank_id = bk.id
      WHERE pm.is_active = 1 AND pm.tenant_id = $1 ORDER BY bk.name, pm.name
    `, [tid]);

    // Recent transactions
    const recent = await queryRows(`
      SELECT t.*, b.name as brand_name, pm.name as pm_name, ec.name as category_name, tm.name as team_name
      FROM transactions t
      LEFT JOIN finance_brands b ON t.brand_id = b.id
      LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
      LEFT JOIN expense_categories ec ON t.category_id = ec.id
      LEFT JOIN teams tm ON t.team_id = tm.id
      WHERE t.tenant_id = $1
      ORDER BY t.created_at DESC LIMIT 10
    `, [tid]);

    // Available months
    const months = await queryRows(`
      SELECT DISTINCT EXTRACT(MONTH FROM transaction_date)::int as month,
             EXTRACT(YEAR FROM transaction_date)::int as year
      FROM transactions
      WHERE tenant_id = $1
      ORDER BY year DESC, month DESC LIMIT 24
    `, [tid]);

    return {
      month: m, year: y,
      expense: { usd: parseFloat(expenseUsd.total_usd), idr: parseFloat(expenseUsd.total_idr) },
      budget: { usd: parseFloat(budget.total_budget), idr: parseFloat(budget.total_budget_idr) },
      byBrand, byPayment, byTeam, balances, recent, months,
    };
  });
}

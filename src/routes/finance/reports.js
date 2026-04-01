/**
 * Finance Reports — aggregated data
 */

import { queryRows, queryOne } from '../../storage/postgres.js';

export default async function (app) {
  app.get('/api/finance/reports', async (request) => {
    const tid = request.tenantId;
    const { month, year, brand_id, start_date, end_date } = request.query;

    let dateFilter = '';
    const params = [tid];
    let idx = 2;

    if (start_date && end_date) {
      dateFilter = `AND t.transaction_date BETWEEN $${idx++} AND $${idx++}`;
      params.push(start_date, end_date);
    } else if (month && year) {
      dateFilter = `AND EXTRACT(MONTH FROM t.transaction_date) = $${idx++} AND EXTRACT(YEAR FROM t.transaction_date) = $${idx++}`;
      params.push(parseInt(month), parseInt(year));
    }

    let brandFilter = '';
    if (brand_id) {
      brandFilter = ` AND t.brand_id = $${idx++}`;
      params.push(parseInt(brand_id));
    }

    const where = `WHERE t.tenant_id = $1 ${dateFilter} ${brandFilter}`;

    // By brand
    const byBrand = await queryRows(`
      SELECT b.name as brand_name,
        COALESCE(SUM(CASE WHEN t.currency IN ('USD','USDT') THEN t.amount ELSE 0 END), 0) as total_usd,
        COALESCE(SUM(CASE WHEN t.currency = 'IDR' THEN t.amount ELSE 0 END), 0) as total_idr,
        COALESCE(SUM(t.amount_idr), 0) as total_cost_idr,
        COUNT(t.id) as tx_count
      FROM transactions t
      LEFT JOIN finance_brands b ON t.brand_id = b.id
      ${where}
      GROUP BY b.id, b.name ORDER BY total_usd DESC
    `, params);

    // By team
    const byTeam = await queryRows(`
      SELECT tm.name as team_name,
        COALESCE(SUM(CASE WHEN t.currency IN ('USD','USDT') THEN t.amount ELSE 0 END), 0) as total_usd,
        COALESCE(SUM(CASE WHEN t.currency = 'IDR' THEN t.amount ELSE 0 END), 0) as total_idr,
        COUNT(t.id) as tx_count
      FROM transactions t
      LEFT JOIN teams tm ON t.team_id = tm.id
      ${where}
      GROUP BY tm.id, tm.name ORDER BY total_usd DESC
    `, params);

    // By payment method
    const byPayment = await queryRows(`
      SELECT pm.name as pm_name, bk.name as bank_name, pm.currency,
        COALESCE(SUM(t.amount), 0) as total,
        COUNT(t.id) as tx_count
      FROM transactions t
      JOIN payment_methods pm ON t.payment_method_id = pm.id
      JOIN banks bk ON pm.bank_id = bk.id
      ${where}
      GROUP BY pm.id, pm.name, bk.name, pm.currency ORDER BY total DESC
    `, params);

    // Grand total
    const grandTotal = await queryOne(`
      SELECT
        COALESCE(SUM(CASE WHEN t.currency IN ('USD','USDT') THEN t.amount ELSE 0 END), 0) as total_usd,
        COALESCE(SUM(CASE WHEN t.currency = 'IDR' THEN t.amount ELSE 0 END), 0) as total_idr,
        COALESCE(SUM(t.amount_idr), 0) as total_cost_idr,
        COUNT(t.id) as tx_count
      FROM transactions t
      ${where}
    `, params);

    return {
      filters: { month, year, brand_id, start_date, end_date },
      byBrand, byTeam, byPayment, grandTotal,
    };
  });

  // GET /api/finance/reports/export-csv — download CSV
  app.get('/api/finance/reports/export-csv', async (request, reply) => {
    const tid = request.tenantId;
    const { month, year, start_date, end_date } = request.query;

    let dateFilter = '';
    const params = [tid];
    let idx = 2;

    if (start_date && end_date) {
      dateFilter = `AND t.transaction_date BETWEEN $${idx++} AND $${idx++}`;
      params.push(start_date, end_date);
    } else if (month && year) {
      dateFilter = `AND EXTRACT(MONTH FROM t.transaction_date) = $${idx++} AND EXTRACT(YEAR FROM t.transaction_date) = $${idx++}`;
      params.push(parseInt(month), parseInt(year));
    }

    const rows = await queryRows(`
      SELECT t.transaction_date, b.name as brand, pm.name as payment_method, pm.currency,
        t.amount, t.amount_idr, ec.name as category, tm.name as team, t.description
      FROM transactions t
      LEFT JOIN finance_brands b ON t.brand_id = b.id
      LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
      LEFT JOIN expense_categories ec ON t.category_id = ec.id
      LEFT JOIN teams tm ON t.team_id = tm.id
      WHERE t.tenant_id = $1 ${dateFilter}
      ORDER BY t.transaction_date ASC
    `, params);

    // Build CSV
    const header = 'Date,Brand,Payment Method,Currency,Amount,Amount IDR,Category,Team,Description';
    const csv = [header, ...rows.map(r =>
      [r.transaction_date?.toISOString?.()?.split('T')[0] || r.transaction_date, r.brand, r.payment_method, r.currency, r.amount, r.amount_idr, r.category, r.team, `"${(r.description || '').replace(/"/g, '""')}"`].join(',')
    )].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="finance-report-${month || 'all'}-${year || ''}.csv"`);
    return csv;
  });
}

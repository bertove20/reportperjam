/**
 * Finance Reports — aggregated data
 */

import { queryRows, queryOne } from '../../storage/postgres.js';

export default async function (app) {
  app.get('/api/finance/reports', async (request) => {
    const { month, year, brand_id, start_date, end_date } = request.query;

    let dateFilter = '';
    const params = [];
    let idx = 1;

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

    const where = `WHERE 1=1 ${dateFilter} ${brandFilter}`;

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
}

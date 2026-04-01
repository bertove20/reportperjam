/**
 * Home Dashboard — combined overview of Report Bot + Finance
 */

import { queryOne, queryRows } from '../storage/postgres.js';
import { getAllBrands } from '../storage/brand-store.js';
import { getLatestLog } from '../storage/log-store.js';

export default async function homeRoutes(app) {
  app.get('/api/home/dashboard', async (request) => {
    const tid = request.tenantId;
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });

    // Report Bot summary
    const reportBrands = await getAllBrands(true, tid);
    const reportBrandsWithStatus = [];
    for (const b of reportBrands.slice(0, 10)) {
      const lastFetch = await getLatestLog(b.key, 'fetch', tid);
      reportBrandsWithStatus.push({
        key: b.key, name: b.name,
        lastStatus: lastFetch?.status || 'N/A',
        lastAt: lastFetch?.created_at,
      });
    }

    const todaySnapshots = await queryOne(
      'SELECT COUNT(DISTINCT brand) as brands_active, MAX(hour) as latest_hour FROM hourly_snapshots WHERE date = $1 AND tenant_id = $2',
      [today, tid]
    );

    // Finance summary
    const financeExpense = await queryOne(`
      SELECT COALESCE(SUM(CASE WHEN currency IN ('USD','USDT') THEN amount ELSE 0 END), 0) as usd,
             COALESCE(SUM(CASE WHEN currency = 'IDR' THEN amount ELSE 0 END), 0) as idr,
             COUNT(*) as tx_count
      FROM transactions
      WHERE EXTRACT(MONTH FROM transaction_date) = $1 AND EXTRACT(YEAR FROM transaction_date) = $2 AND tenant_id = $3
    `, [m, y, tid]);

    const walletBalance = await queryOne(`
      SELECT COALESCE(SUM(CASE WHEN currency IN ('USD','USDT') THEN current_balance ELSE 0 END), 0) as usd,
             COALESCE(SUM(CASE WHEN currency = 'IDR' THEN current_balance ELSE 0 END), 0) as idr
      FROM payment_methods WHERE is_active = 1 AND tenant_id = $1
    `, [tid]);

    const loanOutstanding = await queryOne(
      "SELECT COALESCE(SUM(amount - repaid_amount), 0) as total FROM loans WHERE status != 'repaid' AND tenant_id = $1",
      [tid]
    );

    // User count
    const userCount = await queryOne('SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND is_active = 1', [tid]);

    return {
      report: {
        totalBrands: reportBrands.length,
        brandsActive: parseInt(todaySnapshots?.brands_active || 0),
        latestHour: todaySnapshots?.latest_hour || 0,
        brands: reportBrandsWithStatus,
      },
      finance: {
        expenseThisMonth: { usd: parseFloat(financeExpense.usd), idr: parseFloat(financeExpense.idr) },
        txCount: parseInt(financeExpense.tx_count),
        walletBalance: { usd: parseFloat(walletBalance.usd), idr: parseFloat(walletBalance.idr) },
        loanOutstanding: parseFloat(loanOutstanding.total),
      },
      users: parseInt(userCount.count),
      month: m, year: y,
    };
  });
}

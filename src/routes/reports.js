/**
 * Reports Routes — Hourly data, daily summary, comparison, chart data
 */

import { getTimBrandData } from '../tim/tim-data.js';
import { getDb } from '../storage/sqlite.js';

export default async function reportRoutes(app) {
  // GET /api/reports/hourly?brand=BRAND_E&date=2026-03-30
  app.get('/api/reports/hourly', async (request, reply) => {
    const { brand, date } = request.query;
    if (!brand || !date) {
      return reply.code(400).send({ error: 'brand and date required' });
    }

    // Calculate yesterday
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const yesterdayDate = d.toISOString().split('T')[0];

    // Get current hour (for determining active row)
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
    const currentHour = date === todayStr
      ? parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh', hour: 'numeric', hour12: false }))
      : 23;

    const data = getTimBrandData(brand, date, yesterdayDate, currentHour);
    return { ...data, brand, date, yesterdayDate, currentHour };
  });

  // GET /api/reports/daily-summary?brand=BRAND_E&from=2026-03-01&to=2026-03-30
  app.get('/api/reports/daily-summary', async (request, reply) => {
    const { brand, from, to } = request.query;
    if (!brand || !from || !to) {
      return reply.code(400).send({ error: 'brand, from, to required' });
    }

    const rows = getDb().prepare(`
      SELECT date, deposit_accepted_count as trx, regis_total as regis
      FROM hourly_snapshots
      WHERE brand = ? AND date BETWEEN ? AND ? AND hour = 24
      ORDER BY date ASC
    `).all(brand, from, to);

    return { brand, from, to, data: rows };
  });

  // GET /api/reports/comparison?date=2026-03-30
  app.get('/api/reports/comparison', async (request, reply) => {
    const { date } = request.query;
    if (!date) {
      return reply.code(400).send({ error: 'date required' });
    }

    // Get latest hour data for each brand
    const rows = getDb().prepare(`
      SELECT brand, MAX(hour) as lastHour, deposit_accepted_count as trx, regis_total as regis
      FROM hourly_snapshots
      WHERE date = ? AND hour <= 23
      GROUP BY brand
      ORDER BY deposit_accepted_count DESC
    `).all(date);

    // Get yesterday's data for comparison
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const yesterdayDate = d.toISOString().split('T')[0];

    const yesterdayRows = getDb().prepare(`
      SELECT brand, deposit_accepted_count as trx, regis_total as regis
      FROM hourly_snapshots
      WHERE date = ? AND hour = 24
    `).all(yesterdayDate);
    const yesterdayMap = new Map(yesterdayRows.map(r => [r.brand, r]));

    const brands = rows.map(r => ({
      brand: r.brand,
      lastHour: r.lastHour,
      trx: r.trx,
      regis: r.regis,
      yesterdayTrx: yesterdayMap.get(r.brand)?.trx || 0,
      yesterdayRegis: yesterdayMap.get(r.brand)?.regis || 0,
      trxGap: r.trx - (yesterdayMap.get(r.brand)?.trx || 0),
      regisGap: r.regis - (yesterdayMap.get(r.brand)?.regis || 0),
    }));

    return { date, yesterdayDate, brands };
  });

  // GET /api/reports/chart-data?brand=BRAND_E&from=2026-03-25&to=2026-03-30
  app.get('/api/reports/chart-data', async (request, reply) => {
    const { brand, from, to } = request.query;
    if (!brand || !from || !to) {
      return reply.code(400).send({ error: 'brand, from, to required' });
    }

    // FINISH data (hour=24) per day
    const finishRows = getDb().prepare(`
      SELECT date, deposit_accepted_count as trx, regis_total as regis
      FROM hourly_snapshots
      WHERE brand = ? AND date BETWEEN ? AND ? AND hour = 24
      ORDER BY date ASC
    `).all(brand, from, to);

    // Hourly breakdown for the latest date
    const latestDate = to;
    const hourlyRows = getDb().prepare(`
      SELECT hour, deposit_accepted_count as trx, regis_total as regis
      FROM hourly_snapshots
      WHERE brand = ? AND date = ? AND hour <= 23
      ORDER BY hour ASC
    `).all(brand, latestDate);

    return {
      brand, from, to,
      dailyTrend: finishRows,
      hourlyBreakdown: hourlyRows,
    };
  });

  // GET /api/reports/dates?brand=BRAND_E — list available dates
  app.get('/api/reports/dates', async (request, reply) => {
    const { brand } = request.query;
    if (!brand) {
      return reply.code(400).send({ error: 'brand required' });
    }

    const rows = getDb().prepare(`
      SELECT DISTINCT date FROM hourly_snapshots
      WHERE brand = ?
      ORDER BY date DESC
      LIMIT 90
    `).all(brand);

    return rows.map(r => r.date);
  });
}

/**
 * Reports Routes — Hourly data, daily summary, comparison, chart data (PostgreSQL)
 */

import { getTimBrandData } from '../tim/tim-data.js';
import { queryRows, queryOne } from '../storage/postgres.js';

export default async function reportRoutes(app) {
  // GET /api/reports/hourly
  app.get('/api/reports/hourly', async (request, reply) => {
    const { brand, date } = request.query;
    if (!brand || !date) return reply.code(400).send({ error: 'brand and date required' });

    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    const yesterdayDate = d.toISOString().split('T')[0];

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
    const isToday = date === todayStr;
    let currentHour;

    if (isToday) {
      currentHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh', hour: 'numeric', hour12: false }));
    } else {
      const hasFinish = await queryOne(
        'SELECT 1 FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = 24', [brand, date]
      );
      currentHour = hasFinish ? 0 : 23;
    }

    const data = await getTimBrandData(brand, date, yesterdayDate, currentHour);
    return { ...data, brand, date, yesterdayDate, currentHour };
  });

  // GET /api/reports/daily-summary
  app.get('/api/reports/daily-summary', async (request, reply) => {
    const { brand, from, to } = request.query;
    if (!brand || !from || !to) return reply.code(400).send({ error: 'brand, from, to required' });

    const rows = await queryRows(
      'SELECT date, deposit_accepted_count as trx, regis_total as regis FROM hourly_snapshots WHERE brand = $1 AND date BETWEEN $2 AND $3 AND hour = 24 ORDER BY date ASC',
      [brand, from, to]
    );
    return { brand, from, to, data: rows };
  });

  // GET /api/reports/comparison
  app.get('/api/reports/comparison', async (request, reply) => {
    const { date } = request.query;
    if (!date) return reply.code(400).send({ error: 'date required' });

    const rows = await queryRows(
      `SELECT brand, MAX(hour) as lasthour, MAX(deposit_accepted_count) as trx, MAX(regis_total) as regis
       FROM hourly_snapshots WHERE date = $1 AND hour <= 23
       GROUP BY brand ORDER BY MAX(deposit_accepted_count) DESC`,
      [date]
    );

    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    const yesterdayDate = d.toISOString().split('T')[0];

    const yesterdayRows = await queryRows(
      'SELECT brand, deposit_accepted_count as trx, regis_total as regis FROM hourly_snapshots WHERE date = $1 AND hour = 24',
      [yesterdayDate]
    );
    const yesterdayMap = new Map(yesterdayRows.map(r => [r.brand, r]));

    const brands = rows.map(r => ({
      brand: r.brand, lastHour: r.lasthour, trx: r.trx, regis: r.regis,
      yesterdayTrx: yesterdayMap.get(r.brand)?.trx || 0,
      yesterdayRegis: yesterdayMap.get(r.brand)?.regis || 0,
      trxGap: r.trx - (yesterdayMap.get(r.brand)?.trx || 0),
      regisGap: r.regis - (yesterdayMap.get(r.brand)?.regis || 0),
    }));
    return { date, yesterdayDate, brands };
  });

  // GET /api/reports/chart-data
  app.get('/api/reports/chart-data', async (request, reply) => {
    const { brand, from, to } = request.query;
    if (!brand || !from || !to) return reply.code(400).send({ error: 'brand, from, to required' });

    const finishRows = await queryRows(
      'SELECT date, deposit_accepted_count as trx, regis_total as regis FROM hourly_snapshots WHERE brand = $1 AND date BETWEEN $2 AND $3 AND hour = 24 ORDER BY date ASC',
      [brand, from, to]
    );

    const hourlyRows = await queryRows(
      'SELECT hour, deposit_accepted_count as trx, regis_total as regis FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour <= 23 ORDER BY hour ASC',
      [brand, to]
    );

    return { brand, from, to, dailyTrend: finishRows, hourlyBreakdown: hourlyRows };
  });

  // GET /api/reports/summary
  app.get('/api/reports/summary', async (request, reply) => {
    const { brand, date } = request.query;
    if (!brand || !date) return reply.code(400).send({ error: 'brand and date required' });

    const getFinish = (d) => queryOne(
      'SELECT deposit_accepted_count as trx, regis_total as regis FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = 24', [brand, d]
    );
    const getLatest = (d) => queryOne(
      'SELECT MAX(hour) as hour, MAX(deposit_accepted_count) as trx, MAX(regis_total) as regis FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour <= 23', [brand, d]
    );

    const todayData = await getLatest(date);

    const yd = new Date(date + 'T12:00:00'); yd.setDate(yd.getDate() - 1);
    const yesterdayStr = yd.toISOString().split('T')[0];
    const w = new Date(date + 'T12:00:00'); w.setDate(w.getDate() - 7);
    const weekAgoStr = w.toISOString().split('T')[0];
    const m = new Date(date + 'T12:00:00'); m.setDate(m.getDate() - 30);
    const monthAgoStr = m.toISOString().split('T')[0];

    const [yesterdayFinish, weekAgoFinish, monthAgoFinish, avg7, avg30] = await Promise.all([
      getFinish(yesterdayStr),
      getFinish(weekAgoStr),
      getFinish(monthAgoStr),
      queryOne('SELECT ROUND(AVG(deposit_accepted_count)) as avgtrx, ROUND(AVG(regis_total)) as avgregis FROM hourly_snapshots WHERE brand = $1 AND date BETWEEN $2 AND $3 AND hour = 24', [brand, weekAgoStr, yesterdayStr]),
      queryOne('SELECT ROUND(AVG(deposit_accepted_count)) as avgtrx, ROUND(AVG(regis_total)) as avgregis FROM hourly_snapshots WHERE brand = $1 AND date BETWEEN $2 AND $3 AND hour = 24', [brand, monthAgoStr, yesterdayStr]),
    ]);

    return {
      brand, date,
      today: { trx: todayData?.trx || 0, regis: todayData?.regis || 0, hour: todayData?.hour || 0 },
      yesterday: { date: yesterdayStr, trx: yesterdayFinish?.trx || 0, regis: yesterdayFinish?.regis || 0 },
      weekAgo: { date: weekAgoStr, trx: weekAgoFinish?.trx || 0, regis: weekAgoFinish?.regis || 0 },
      monthAgo: { date: monthAgoStr, trx: monthAgoFinish?.trx || 0, regis: monthAgoFinish?.regis || 0 },
      avg7days: { trx: avg7?.avgtrx || 0, regis: avg7?.avgregis || 0 },
      avg30days: { trx: avg30?.avgtrx || 0, regis: avg30?.avgregis || 0 },
    };
  });

  // GET /api/reports/dates
  app.get('/api/reports/dates', async (request, reply) => {
    const { brand } = request.query;
    if (!brand) return reply.code(400).send({ error: 'brand required' });

    const rows = await queryRows(
      'SELECT DISTINCT date FROM hourly_snapshots WHERE brand = $1 ORDER BY date DESC LIMIT 90', [brand]
    );
    return rows.map(r => r.date);
  });
}

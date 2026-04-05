/**
 * Referral Report HTML Builder — Excel-style per-referral card layout
 *
 * Per referral card:
 *   - Header: brand name (big, yellow background) + SUNTIK TRAFFIC badge + ID REFF badge
 *   - Table: 4 rows × N days (Tanggal, New Regis, New Deposit, Persentase)
 *   - Chart: overlapping bars per day (red = New Regis, blue = New Deposit) with % label on top
 */

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function fmt(n) {
  if (n === null || n === undefined || n === 0) return '';
  return Number(n).toLocaleString('id-ID');
}

function pct(regis, depo) {
  const total = (regis || 0) + (depo || 0);
  if (total === 0) return '';
  return ((depo / total) * 100).toFixed(2) + '%';
}

function pctRaw(regis, depo) {
  const total = (regis || 0) + (depo || 0);
  if (total === 0) return 0;
  return (depo / total) * 100;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * @param {Object} data
 * @param {string} data.divisionName
 * @param {string} data.date — YYYY-MM-DD
 * @param {Array} data.monthly — [{brand_key, brand_name, brand_color, referral_code, display_name, days: [{day, new_regis, depo_regis}], year, month, daysInMonth}]
 */
export function buildReferralReportHtml({ divisionName, date, monthly = [] }) {
  if (monthly.length === 0) {
    return simpleEmptyHtml(divisionName, date);
  }

  const firstItem = monthly[0];
  const monthLabel = `${MONTHS_ID[firstItem.month - 1]} ${firstItem.year}`;
  const todayDay = parseInt(date.split('-')[2]);

  const cards = monthly.map(item => buildReferralCard(item, todayDay)).join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    background: #e5e7eb;
    padding: 16px;
    width: 1700px;
  }
  .master-header {
    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
    color: white;
    padding: 20px 32px;
    border-radius: 10px 10px 0 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .master-title {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .master-sub {
    font-size: 13px;
    opacity: 0.9;
    margin-top: 2px;
  }
  .master-date {
    text-align: right;
    font-size: 13px;
    opacity: 0.9;
  }
  .master-date b { font-size: 18px; font-weight: 700; display: block; }

  /* Per-referral card */
  .ref-card {
    background: white;
    margin-top: 16px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  }

  /* Brand header */
  .brand-banner {
    background: #fbbf24;
    display: flex;
    align-items: center;
    min-height: 70px;
  }
  .brand-left {
    display: flex;
    flex-direction: column;
    min-width: 300px;
    padding: 0;
  }
  .suntik-badge {
    background: #111827;
    color: white;
    font-weight: 800;
    padding: 12px 20px;
    font-size: 16px;
    letter-spacing: 1px;
    text-align: center;
    border: 2px solid #111827;
  }
  .ref-badge {
    background: #a7f3d0;
    color: #064e3b;
    font-weight: 700;
    padding: 12px 20px;
    font-size: 14px;
    text-align: center;
    border: 2px solid #111827;
    border-top: none;
    font-family: 'Courier New', monospace;
  }
  .brand-name {
    flex: 1;
    text-align: center;
    font-size: 42px;
    font-weight: 900;
    color: #111827;
    letter-spacing: 2px;
    padding: 0 20px;
  }

  /* Month table */
  .month-table {
    border-collapse: collapse;
    font-size: 12px;
    font-family: 'Segoe UI', Arial, sans-serif;
    table-layout: fixed;
    width: 100%;
  }
  .month-table th, .month-table td {
    border: 1px solid #111827;
    padding: 6px 2px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .month-table .row-label {
    background: #86efac;
    color: #064e3b;
    font-weight: 800;
    text-align: left;
    padding: 6px 12px;
    width: 130px;
    font-size: 12px;
  }
  .month-table .col-total {
    background: #fcd34d !important;
    color: #78350f !important;
    font-weight: 800 !important;
    width: 85px;
    font-size: 13px;
  }
  .month-table .row-tanggal .row-label { background: #86efac; }
  .month-table .row-regis .row-label { background: #fecaca; }
  .month-table .row-depo .row-label { background: #bfdbfe; }
  .month-table .row-pct .row-label { background: #86efac; }
  .month-table .row-tanggal td:not(.row-label) {
    background: #86efac;
    color: #064e3b;
    font-weight: 700;
  }
  .month-table .row-regis td:not(.row-label) {
    background: #fecaca;
    color: #7f1d1d;
  }
  .month-table .row-depo td:not(.row-label) {
    background: #bfdbfe;
    color: #1e3a8a;
  }
  .month-table .row-pct td:not(.row-label) {
    background: #d9f99d;
    color: #365314;
    font-weight: 600;
  }
  .today-cell {
    outline: 3px solid #f59e0b !important;
    outline-offset: -2px;
  }

  /* Chart */
  .chart-wrap {
    padding: 20px 20px 10px 20px;
    background: #f3f4f6;
  }
  .chart {
    position: relative;
    height: 340px;
    display: flex;
    align-items: flex-end;
    border-bottom: 2px solid #111827;
    border-left: 2px solid #111827;
    padding: 0 8px 0 40px;
    gap: 4px;
  }
  .y-axis {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: 36px;
    font-size: 10px;
    color: #374151;
  }
  .y-label {
    position: absolute;
    right: 4px;
    transform: translateY(50%);
    font-variant-numeric: tabular-nums;
  }
  .y-grid {
    position: absolute;
    left: 40px;
    right: 8px;
    border-top: 1px dashed #d1d5db;
    height: 0;
  }
  .bar-group {
    flex: 1;
    height: 100%;
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 1px;
  }
  .bar {
    width: 48%;
    position: relative;
    border: 1px solid #111827;
  }
  .bar-regis { background: #dc2626; }
  .bar-depo { background: #2563eb; }
  .bar-value {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 10px;
    font-weight: 700;
    text-shadow: 1px 1px 0 rgba(0,0,0,0.5);
  }
  .bar-pct {
    position: absolute;
    top: -18px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 9px;
    font-weight: 700;
    color: #7f1d1d;
    white-space: nowrap;
  }
  .chart-x {
    display: flex;
    padding: 4px 8px 0 40px;
    gap: 4px;
  }
  .x-label {
    flex: 1;
    text-align: center;
    font-size: 10px;
    color: #374151;
    font-variant-numeric: tabular-nums;
  }
  .legend {
    margin-top: 12px;
    display: flex;
    justify-content: center;
    gap: 24px;
    font-size: 12px;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-swatch { width: 14px; height: 14px; border: 1px solid #111827; display: inline-block; }
  .legend-regis { background: #dc2626; }
  .legend-depo { background: #2563eb; }
</style>
</head>
<body>
  <div class="master-header">
    <div>
      <div class="master-title">REFERRAL REPORT — ${escapeHtml(divisionName)}</div>
      <div class="master-sub">Perkembangan referral bulan ${monthLabel}</div>
    </div>
    <div class="master-date">
      <b>${date}</b>
      <span>(Highlight = hari ini)</span>
    </div>
  </div>
  ${cards}
</body>
</html>`;
}

function buildReferralCard(item, todayDay) {
  const { brand_name, referral_code, display_name, referral_type, days, daysInMonth } = item;
  const typeLabel = referral_type || 'SUNTIK TRAFFIC';

  // Determine max for y-axis scale
  let maxVal = 0;
  for (const d of days) {
    const v = Math.max(d.new_regis || 0, d.depo_regis || 0);
    if (v > maxVal) maxVal = v;
  }
  if (maxVal === 0) maxVal = 10;
  // Round up to nice number
  const niceMax = Math.ceil(maxVal / 10) * 10 || 10;

  // Totals
  let totalNew = 0;
  let totalDepo = 0;
  for (const d of days) {
    totalNew += d.new_regis || 0;
    totalDepo += d.depo_regis || 0;
  }
  const totalPct = pct(totalNew, totalDepo) || '—';

  // Table rows (limit to daysInMonth)
  const dayHeaders = [];
  const regisCells = [];
  const depoCells = [];
  const pctCells = [];
  for (const d of days) {
    const isToday = d.day === todayDay;
    const cls = isToday ? 'today-cell' : '';
    dayHeaders.push(`<td class="${cls}">${d.day}</td>`);
    regisCells.push(`<td class="${cls}">${fmt(d.new_regis)}</td>`);
    depoCells.push(`<td class="${cls}">${fmt(d.depo_regis)}</td>`);
    pctCells.push(`<td class="${cls}">${pct(d.new_regis, d.depo_regis)}</td>`);
  }

  // Chart bars
  const barGroups = days.map(d => {
    const regisH = ((d.new_regis || 0) / niceMax) * 100;
    const depoH = ((d.depo_regis || 0) / niceMax) * 100;
    const p = pctRaw(d.new_regis, d.depo_regis);
    const pctLabel = p > 0 ? p.toFixed(2) + '%' : '';
    const hasData = (d.new_regis || 0) > 0 || (d.depo_regis || 0) > 0;
    return `
      <div class="bar-group">
        ${hasData ? `<div class="bar-pct">${pctLabel}</div>` : ''}
        ${d.new_regis > 0 ? `<div class="bar bar-regis" style="height:${regisH}%"><span class="bar-value">${fmt(d.new_regis)}</span></div>` : '<div class="bar bar-regis" style="height:0"></div>'}
        ${d.depo_regis > 0 ? `<div class="bar bar-depo" style="height:${depoH}%"><span class="bar-value">${fmt(d.depo_regis)}</span></div>` : '<div class="bar bar-depo" style="height:0"></div>'}
      </div>`;
  }).join('');

  const xLabels = days.map(d => `<div class="x-label">${d.day}</div>`).join('');

  // Y-axis ticks (0, 25%, 50%, 75%, 100%)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const val = Math.round(niceMax * t);
    const bottom = (t * 100).toFixed(0);
    return `
      <div class="y-label" style="bottom:${bottom}%">${val}</div>
      <div class="y-grid" style="bottom:${bottom}%"></div>`;
  }).join('');

  return `
  <div class="ref-card">
    <div class="brand-banner">
      <div class="brand-left">
        <div class="suntik-badge">${escapeHtml(typeLabel)}</div>
        <div class="ref-badge">ID REFF : ${escapeHtml(referral_code)}</div>
      </div>
      <div class="brand-name">${escapeHtml(brand_name)}</div>
      <div style="width:40px"></div>
    </div>
    <table class="month-table">
      <tr class="row-tanggal">
        <td class="row-label">Tanggal</td>
        ${dayHeaders.join('')}
        <td class="col-total">TOTAL</td>
      </tr>
      <tr class="row-regis">
        <td class="row-label">New Regis</td>
        ${regisCells.join('')}
        <td class="col-total">${fmt(totalNew) || '0'}</td>
      </tr>
      <tr class="row-depo">
        <td class="row-label">New Deposit</td>
        ${depoCells.join('')}
        <td class="col-total">${fmt(totalDepo) || '0'}</td>
      </tr>
      <tr class="row-pct">
        <td class="row-label">Persentase</td>
        ${pctCells.join('')}
        <td class="col-total">${totalPct}</td>
      </tr>
    </table>
    <div class="chart-wrap">
      <div class="chart">
        <div class="y-axis">${ticks}</div>
        ${barGroups}
      </div>
      <div class="chart-x">${xLabels}</div>
      <div class="legend">
        <div class="legend-item"><span class="legend-swatch legend-regis"></span>New Regis</div>
        <div class="legend-item"><span class="legend-swatch legend-depo"></span>New Deposit</div>
        <div class="legend-item"><span style="width:14px;height:14px;border:2px solid #f59e0b;display:inline-block;"></span>Hari ini</div>
      </div>
    </div>
  </div>`;
}

function simpleEmptyHtml(divisionName, date) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: sans-serif; padding: 40px; background: #f3f4f6; width: 900px; }
  .empty { background: white; border-radius: 10px; padding: 40px; text-align: center; color: #6b7280; }
  h1 { color: #111827; margin-bottom: 12px; }
</style></head><body>
  <div class="empty">
    <h1>${escapeHtml(divisionName)}</h1>
    <p>Tidak ada referral aktif terdaftar untuk divisi ini pada ${date}.</p>
    <p style="margin-top:12px;font-size:12px;">Silakan tambahkan referral code via admin panel → Report Bot → Referrals</p>
  </div>
</body></html>`;
}

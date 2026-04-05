/**
 * Referral Report HTML Builder
 *
 * Layout:
 *   Header: "REFERRAL REPORT" + nama divisi + tanggal
 *   Per brand: section dengan warna brand, tabel (Referral | New Regis | Depo Regis | Ratio)
 *   Footer: Total divisi
 */

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+07:00');
  return `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function fmt(n) {
  return (n ?? 0).toLocaleString('id-ID');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatShortDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

/**
 * @param {Object} data
 * @param {string} data.divisionName
 * @param {string} data.date — YYYY-MM-DD
 * @param {Array} data.brands — [{ brand_key, brand_name, brand_color, referrals: [{referral_code, display_name, new_regis, depo_regis}] }]
 * @param {Array} [data.trend] — [{ date, new_regis, depo_regis }, ...] untuk 30 hari terakhir
 */
export function buildReferralReportHtml({ divisionName, date, brands, trend = [] }) {
  const dateFormatted = formatDate(date);

  let grandNew = 0;
  let grandDepo = 0;
  for (const b of brands) {
    for (const r of b.referrals) {
      grandNew += r.new_regis || 0;
      grandDepo += r.depo_regis || 0;
    }
  }

  const brandSections = brands.map(b => {
    const color = b.brand_color || '#7c3aed';
    const subNew = b.referrals.reduce((a, r) => a + (r.new_regis || 0), 0);
    const subDepo = b.referrals.reduce((a, r) => a + (r.depo_regis || 0), 0);

    const rows = b.referrals.map(r => {
      const ratio = r.new_regis > 0 ? ((r.depo_regis / r.new_regis) * 100).toFixed(1) + '%' : '—';
      return `
        <tr>
          <td class="ref">${escapeHtml(r.display_name)}</td>
          <td class="num">${fmt(r.new_regis)}</td>
          <td class="num">${fmt(r.depo_regis)}</td>
          <td class="ratio">${ratio}</td>
        </tr>`;
    }).join('');

    const subRatio = subNew > 0 ? ((subDepo / subNew) * 100).toFixed(1) + '%' : '—';

    return `
      <div class="brand-section">
        <div class="brand-header" style="background:${color}">
          <span class="brand-name">${escapeHtml(b.brand_name)}</span>
          <span class="brand-key">${escapeHtml(b.brand_key)}</span>
        </div>
        <table class="ref-table">
          <thead>
            <tr>
              <th>Referral</th>
              <th class="num">New Regis</th>
              <th class="num">Depo Regis</th>
              <th class="num">Depo %</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="4" class="empty">Tidak ada data referral</td></tr>'}</tbody>
          <tfoot>
            <tr>
              <td class="subtotal-label">Subtotal</td>
              <td class="num subtotal">${fmt(subNew)}</td>
              <td class="num subtotal">${fmt(subDepo)}</td>
              <td class="ratio subtotal">${subRatio}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }).join('');

  const grandRatio = grandNew > 0 ? ((grandDepo / grandNew) * 100).toFixed(1) + '%' : '—';

  // Build 30-day trend: bar chart + table
  let trendSection = '';
  if (trend && trend.length > 0) {
    const maxVal = Math.max(1, ...trend.map(t => Math.max(t.new_regis || 0, t.depo_regis || 0)));
    const chartBars = trend.map(t => {
      const newH = Math.round(((t.new_regis || 0) / maxVal) * 100);
      const depoH = Math.round(((t.depo_regis || 0) / maxVal) * 100);
      const isToday = t.date === date;
      return `
        <div class="bar-col${isToday ? ' bar-today' : ''}">
          <div class="bar-stack">
            <div class="bar bar-new" style="height:${newH}%" title="New: ${fmt(t.new_regis)}"></div>
            <div class="bar bar-depo" style="height:${depoH}%" title="Depo: ${fmt(t.depo_regis)}"></div>
          </div>
          <div class="bar-label">${formatShortDate(t.date)}</div>
        </div>`;
    }).join('');

    // Trend stats
    const trendNewTotal = trend.reduce((a, t) => a + (t.new_regis || 0), 0);
    const trendDepoTotal = trend.reduce((a, t) => a + (t.depo_regis || 0), 0);
    const trendAvgNew = (trendNewTotal / trend.length).toFixed(1);
    const trendAvgDepo = (trendDepoTotal / trend.length).toFixed(1);
    const trendRatio = trendNewTotal > 0 ? ((trendDepoTotal / trendNewTotal) * 100).toFixed(1) + '%' : '—';

    trendSection = `
      <div class="trend-section">
        <div class="trend-header">
          <div class="trend-title">Perkembangan ${trend.length} Hari Terakhir</div>
          <div class="trend-legend">
            <span class="legend-item"><span class="legend-box legend-new"></span>New Regis</span>
            <span class="legend-item"><span class="legend-box legend-depo"></span>Depo Regis</span>
          </div>
        </div>
        <div class="trend-chart">${chartBars}</div>
        <div class="trend-stats">
          <div class="trend-stat">
            <div class="trend-stat-label">Total ${trend.length}D New</div>
            <div class="trend-stat-value">${fmt(trendNewTotal)}</div>
          </div>
          <div class="trend-stat">
            <div class="trend-stat-label">Total ${trend.length}D Depo</div>
            <div class="trend-stat-value">${fmt(trendDepoTotal)}</div>
          </div>
          <div class="trend-stat">
            <div class="trend-stat-label">Avg/Hari New</div>
            <div class="trend-stat-value">${trendAvgNew}</div>
          </div>
          <div class="trend-stat">
            <div class="trend-stat-label">Avg/Hari Depo</div>
            <div class="trend-stat-value">${trendAvgDepo}</div>
          </div>
          <div class="trend-stat">
            <div class="trend-stat-label">Depo %</div>
            <div class="trend-stat-value">${trendRatio}</div>
          </div>
        </div>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f3f4f6;
    padding: 24px;
    width: 900px;
  }
  .card {
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    overflow: hidden;
  }
  .report-header {
    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
    color: white;
    padding: 24px 28px;
  }
  .report-title {
    font-size: 12px;
    letter-spacing: 2px;
    text-transform: uppercase;
    opacity: 0.9;
  }
  .report-division {
    font-size: 28px;
    font-weight: 800;
    margin-top: 4px;
  }
  .report-date {
    font-size: 14px;
    opacity: 0.9;
    margin-top: 4px;
  }
  .brand-section {
    padding: 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .brand-section:last-of-type { border-bottom: none; }
  .brand-header {
    padding: 12px 20px;
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand-name {
    font-size: 18px;
    font-weight: 700;
  }
  .brand-key {
    font-size: 11px;
    opacity: 0.85;
    font-family: monospace;
  }
  .ref-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .ref-table th {
    background: #f9fafb;
    padding: 10px 16px;
    text-align: left;
    font-weight: 600;
    color: #374151;
    border-bottom: 2px solid #e5e7eb;
    font-size: 12px;
    text-transform: uppercase;
  }
  .ref-table td {
    padding: 10px 16px;
    border-bottom: 1px solid #f3f4f6;
  }
  .ref-table tbody tr:last-child td { border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .ref { font-weight: 500; color: #111827; }
  .ratio { text-align: right; color: #6b7280; font-size: 13px; }
  .empty { text-align: center; color: #9ca3af; font-style: italic; padding: 16px; }
  .subtotal { font-weight: 700; color: #111827; }
  .subtotal-label {
    font-weight: 600;
    color: #6b7280;
    font-size: 12px;
    text-transform: uppercase;
  }
  .ref-table tfoot td { background: #f9fafb; border-top: 1px solid #e5e7eb; }
  .grand-total {
    background: #0f172a;
    color: white;
    padding: 16px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .grand-label { font-size: 13px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.85; }
  .grand-stats { display: flex; gap: 32px; }
  .grand-stat { text-align: right; }
  .grand-stat-label { font-size: 10px; text-transform: uppercase; opacity: 0.7; }
  .grand-stat-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .footer {
    padding: 12px 28px;
    background: #f9fafb;
    font-size: 11px;
    color: #9ca3af;
    text-align: center;
  }
  .trend-section {
    padding: 20px 28px;
    background: #fafbfc;
    border-top: 1px solid #e5e7eb;
  }
  .trend-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .trend-title {
    font-size: 14px;
    font-weight: 700;
    color: #111827;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .trend-legend {
    display: flex;
    gap: 16px;
    font-size: 11px;
    color: #6b7280;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-box {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    display: inline-block;
  }
  .legend-new { background: #3b82f6; }
  .legend-depo { background: #10b981; }
  .trend-chart {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 140px;
    padding: 8px 0;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 12px;
  }
  .bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
  }
  .bar-stack {
    width: 100%;
    height: 110px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
  }
  .bar {
    width: 45%;
    min-height: 1px;
    border-radius: 2px 2px 0 0;
  }
  .bar-new { background: #3b82f6; }
  .bar-depo { background: #10b981; }
  .bar-today .bar-new { background: #1e40af; box-shadow: 0 -2px 4px rgba(30,64,175,0.4); }
  .bar-today .bar-depo { background: #047857; box-shadow: 0 -2px 4px rgba(4,120,87,0.4); }
  .bar-label {
    font-size: 8px;
    color: #9ca3af;
    margin-top: 4px;
    font-variant-numeric: tabular-nums;
  }
  .bar-today .bar-label {
    color: #1e40af;
    font-weight: 700;
  }
  .trend-stats {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
  }
  .trend-stat {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 10px;
    text-align: center;
  }
  .trend-stat-label {
    font-size: 9px;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .trend-stat-value {
    font-size: 18px;
    font-weight: 700;
    color: #111827;
    font-variant-numeric: tabular-nums;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="report-header">
      <div class="report-title">Referral Report</div>
      <div class="report-division">${escapeHtml(divisionName)}</div>
      <div class="report-date">${dateFormatted}</div>
    </div>
    ${brandSections}
    ${trendSection}
    <div class="grand-total">
      <div class="grand-label">Total Divisi</div>
      <div class="grand-stats">
        <div class="grand-stat">
          <div class="grand-stat-label">New Regis</div>
          <div class="grand-stat-value">${fmt(grandNew)}</div>
        </div>
        <div class="grand-stat">
          <div class="grand-stat-label">Depo Regis</div>
          <div class="grand-stat-value">${fmt(grandDepo)}</div>
        </div>
        <div class="grand-stat">
          <div class="grand-stat-label">Depo %</div>
          <div class="grand-stat-value">${grandRatio}</div>
        </div>
      </div>
    </div>
    <div class="footer">Generated automatically by Report Bot</div>
  </div>
</body>
</html>`;
}

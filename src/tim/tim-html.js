/**
 * Tim Report HTML Builder
 * 
 * Terima data dari tim-data.js → generate HTML string lengkap
 * HTML ini yang akan di-screenshot oleh Puppeteer
 * 
 * Layout:
 *   Header (logo + brand name + date + time)
 *   Scoreboard (TRX today + gap + REGIS today + gap)
 *   Trend Bar (per-hour gap blocks: hijau/merah)
 *   Projection (pace, est EOD, target, selisih)
 *   Table (24 rows × 9 columns)
 */

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+07:00');
  return `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function fmt(num) {
  if (num === null || num === undefined) return '—';
  return num.toLocaleString('id-ID');
}

function fmtDelta(num) {
  if (num === null || num === undefined) return '—';
  const sign = num > 0 ? '+' : '';
  return sign + num.toLocaleString('id-ID');
}

function fmtPct(today, yesterday) {
  if (!yesterday || yesterday === 0) return today > 0 ? '+100%' : '0%';
  const pct = ((today - yesterday) / yesterday * 100).toFixed(1);
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}

/**
 * Build ringkasan teks untuk FINISH report
 * Seolah-olah mereview performa hari ini vs kemarin
 */
function buildFinishSummary(sb) {
  const trxPct = fmtPct(sb.trxToday, sb.trxYesterday);
  const regisPct = fmtPct(sb.regisToday, sb.regisYesterday);

  const trxNaik = sb.trxGap > 0;
  const trxTurun = sb.trxGap < 0;
  const regisNaik = sb.regisGap > 0;
  const regisTurun = sb.regisGap < 0;

  const trxKata = trxNaik ? 'kenaikan' : trxTurun ? 'penurunan' : 'tidak ada perubahan';
  const regisKata = regisNaik ? 'kenaikan' : regisTurun ? 'penurunan' : 'tidak ada perubahan';
  const trxIcon = trxNaik ? '📈' : trxTurun ? '📉' : '➡️';
  const regisIcon = regisNaik ? '📈' : regisTurun ? '📉' : '➡️';
  const trxColor = trxNaik ? '#059669' : trxTurun ? '#dc2626' : '#6b7280';
  const regisColor = regisNaik ? '#059669' : regisTurun ? '#dc2626' : '#6b7280';

  return `
<!-- FINISH SUMMARY -->
<div style="margin:8px 16px;padding:10px 14px;background:#f8fafc;border-left:4px solid #6366f1;border-radius:6px;">
  <div style="font-size:11px;font-weight:700;color:#4338ca;margin-bottom:6px;">📋 RINGKASAN HARI INI</div>
  <div style="font-size:11px;color:#374151;line-height:1.7;">
    ${trxIcon} <b>Transaksi</b> mengalami <b style="color:${trxColor};">${trxKata} ${trxPct}</b> — dari <b>${fmt(sb.trxYesterday)}</b> kemarin menjadi <b>${fmt(sb.trxToday)}</b> hari ini (selisih <b style="color:${trxColor};">${fmtDelta(sb.trxGap)}</b>).<br>
    ${regisIcon} <b>Registrasi</b> mengalami <b style="color:${regisColor};">${regisKata} ${regisPct}</b> — dari <b>${fmt(sb.regisYesterday)}</b> kemarin menjadi <b>${fmt(sb.regisToday)}</b> hari ini (selisih <b style="color:${regisColor};">${fmtDelta(sb.regisGap)}</b>).
  </div>
</div>`;
}

/**
 * Build full HTML string for Tim report
 * 
 * @param {object} brand - dari brand-configs.js
 * @param {object} data - dari getTimBrandData() { rows, scoreboard, projection, trendGaps }
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} currentHour - 1-23 atau 0 (FINISH)
 * @returns {string} HTML
 */
export function buildTimHtml(brand, data, dateStr, currentHour) {
  const { rows, scoreboard, projection, trendGaps } = data;
  const hourLabel = currentHour === 0 ? 'FINISH' : `${String(currentHour).padStart(2, '0')}:00`;
  const dateFormatted = formatDate(dateStr);
  const dateParts = dateStr.split('-');
  const dateShort = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

  // Scoreboard
  const sb = scoreboard || { trxToday: 0, trxGap: 0, trxBadge: 'EVEN', regisToday: 0, regisGap: 0, regisBadge: 'EVEN' };
  const trxBadgeColor = sb.trxBadge === 'AHEAD' ? '#059669' : sb.trxBadge === 'BEHIND' ? '#dc2626' : '#6b7280';
  const regisBadgeColor = sb.regisBadge === 'AHEAD' ? '#059669' : sb.regisBadge === 'BEHIND' ? '#dc2626' : '#6b7280';

  // Projection
  const proj = projection?.trx || { pace: 0, estEOD: 0, target: 0, selisih: 0 };

  // Missing hours count
  const missingHours = currentHour > 0 
    ? Array.from({length: currentHour}, (_, i) => i + 1).filter(h => !rows.find(r => r.hour === h && r.trx.today !== null)).length
    : 0;

  // Trend bar HTML
  const trendHtml = trendGaps.map(t => {
    const color = t.gap >= 0 ? '#059669' : '#dc2626';
    return `<span style="display:inline-block;width:28px;height:16px;background:${color};border-radius:3px;margin:1px;font-size:9px;color:white;text-align:center;line-height:16px;">${fmtDelta(t.gap)}</span>`;
  }).join('');

  // Table rows HTML
  const tableRowsHtml = rows.map(row => {
    const bgColor = row.isCurrent ? '#fef9c3' : row.isFuture ? '#f9fafb' : 'white';
    const textColor = row.isFuture ? '#9ca3af' : '#111827';
    const labelStyle = row.hour === 24 ? 'font-weight:bold;' : '';
    
    // Color helper: hijau kalau positif, merah kalau negatif, default kalau nol/null
    const deltaColor = (n) => {
      if (n === null || n === undefined || n === 0) return textColor;
      return n > 0 ? '#059669' : '#dc2626';
    };
    const trxPerHourColor = deltaColor(row.trx.perHour);
    const trxGapColor = deltaColor(row.trx.gap);
    const regisPerHourColor = deltaColor(row.regis.perHour);
    const regisGapColor = deltaColor(row.regis.gap);

    return `<tr style="background:${bgColor};color:${textColor};">
      <td style="text-align:right;padding:3px 6px;font-size:11px;">${fmt(row.trx.yesterday)}</td>
      <td style="text-align:right;padding:3px 6px;font-weight:bold;font-size:12px;">${fmt(row.trx.today)}</td>
      <td style="text-align:right;padding:3px 6px;font-size:11px;color:${trxPerHourColor};font-weight:bold;">${fmtDelta(row.trx.perHour)}</td>
      <td style="text-align:right;padding:3px 6px;font-size:11px;color:${trxGapColor};font-weight:bold;">${fmtDelta(row.trx.gap)}</td>
      <td style="text-align:center;padding:3px 6px;font-weight:bold;font-size:11px;background:#f3f4f6;${labelStyle}">${row.label}</td>
      <td style="text-align:right;padding:3px 6px;font-size:11px;">${fmt(row.regis.yesterday)}</td>
      <td style="text-align:right;padding:3px 6px;font-weight:bold;font-size:12px;">${fmt(row.regis.today)}</td>
      <td style="text-align:right;padding:3px 6px;font-size:11px;color:${regisPerHourColor};font-weight:bold;">${fmtDelta(row.regis.perHour)}</td>
      <td style="text-align:right;padding:3px 6px;font-size:11px;color:${regisGapColor};font-weight:bold;">${fmtDelta(row.regis.gap)}</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; width:650px; background:white; }
  table { border-collapse:collapse; width:100%; table-layout:fixed; }
  th { font-size:10px; text-transform:uppercase; letter-spacing:0.5px; vertical-align:bottom; }
</style></head>
<body>

<!-- HEADER -->
<div style="background:${brand.primary};color:white;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
  <div style="display:flex;align-items:center;gap:10px;">
    ${brand.logo ? `<img src="${brand.logo}" style="height:36px;border-radius:6px;">` : ''}
    <div>
      <div style="font-weight:bold;font-size:16px;letter-spacing:0.5px;text-transform:uppercase;">${brand.name}</div>
      <div style="font-weight:600;font-size:12px;opacity:0.95;">${dateFormatted}</div>
      <div style="font-size:10px;opacity:0.75;">Update ${hourLabel} WIB</div>
    </div>
  </div>
  <div style="background:rgba(255,255,255,0.2);padding:4px 10px;border-radius:4px;font-size:12px;font-weight:bold;">${dateShort}</div>
</div>

<!-- SCOREBOARD -->
<div style="display:flex;padding:10px 16px;gap:12px;">
  <div style="flex:1;background:#f8fafc;padding:10px;border-radius:8px;">
    <div style="font-size:10px;color:#6b7280;font-weight:600;">TRX HARI INI</div>
    <div style="font-size:28px;font-weight:bold;">${fmt(sb.trxToday)}</div>
    <div style="font-size:12px;color:${trxBadgeColor};font-weight:bold;">${fmtDelta(sb.trxGap)}</div>
    <div style="display:inline-block;background:${trxBadgeColor};color:white;font-size:9px;padding:2px 6px;border-radius:3px;font-weight:bold;">${sb.trxBadge}</div>
  </div>
  <div style="flex:1;background:#f8fafc;padding:10px;border-radius:8px;">
    <div style="font-size:10px;color:#6b7280;font-weight:600;">REGIS HARI INI</div>
    <div style="font-size:28px;font-weight:bold;">${fmt(sb.regisToday)}</div>
    <div style="font-size:12px;color:${regisBadgeColor};font-weight:bold;">${fmtDelta(sb.regisGap)}</div>
    <div style="display:inline-block;background:${regisBadgeColor};color:white;font-size:9px;padding:2px 6px;border-radius:3px;font-weight:bold;">${sb.regisBadge}</div>
  </div>
</div>

<!-- TREND BAR -->
<div style="padding:4px 16px;">
  <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">TRX GAP</div>
  <div style="overflow:hidden;">${trendHtml || '<span style="color:#9ca3af;font-size:10px;">No data yet</span>'}</div>
</div>

<!-- PROJECTION -->
<div style="padding:6px 16px;font-size:11px;color:#6b7280;display:flex;gap:16px;flex-wrap:wrap;">
  <span><b>Pace:</b> ${fmt(proj.pace)}/jam</span>
  <span><b>Est EOD:</b> ~${fmt(proj.estEOD)} trx</span>
  <span><b>Target:</b> ${fmt(proj.target)}</span>
  <span><b>Selisih:</b> ${fmtDelta(proj.selisih)} (${proj.target > 0 ? Math.round((proj.selisih / proj.target) * 100) : 0}%)</span>
  ${missingHours > 0 ? `<span style="color:#f59e0b;">⚠ ${missingHours} jam missing</span>` : ''}
</div>

<!-- TABLE -->
<table style="margin-top:6px;">
  <colgroup>
    <col style="width:70px;">
    <col style="width:70px;">
    <col style="width:70px;">
    <col style="width:70px;">
    <col style="width:90px;">
    <col style="width:70px;">
    <col style="width:70px;">
    <col style="width:70px;">
    <col style="width:70px;">
  </colgroup>
  <thead>
    <tr style="background:#f1f5f9;">
      <th colspan="4" style="padding:4px;text-align:center;color:${brand.primary};border-bottom:2px solid ${brand.primary};">INDEX TRX</th>
      <th style="padding:4px;"></th>
      <th colspan="4" style="padding:4px;text-align:center;color:${brand.primary};border-bottom:2px solid ${brand.primary};">INDEX REGIS</th>
    </tr>
    <tr style="background:#f8fafc;">
      <th style="padding:4px 4px;text-align:right;">KMRN</th>
      <th style="padding:4px 4px;text-align:right;">HARI INI</th>
      <th style="padding:4px 4px;text-align:right;">SELISIH<br>/JAM</th>
      <th style="padding:4px 4px;text-align:right;">SELISIH<br>KMRN</th>
      <th style="padding:4px 4px;text-align:center;background:#e5e7eb;">JAM</th>
      <th style="padding:4px 4px;text-align:right;">KMRN</th>
      <th style="padding:4px 4px;text-align:right;">HARI INI</th>
      <th style="padding:4px 4px;text-align:right;">SELISIH<br>/JAM</th>
      <th style="padding:4px 4px;text-align:right;">SELISIH<br>KMRN</th>
    </tr>
  </thead>
  <tbody>
    ${tableRowsHtml}
  </tbody>
</table>

${currentHour === 0 ? buildFinishSummary(sb) : ''}

<div style="padding:6px 16px;font-size:9px;color:#9ca3af;display:flex;justify-content:space-between;">
  <span>Tim Report Bot</span>
  <span>auto-update setiap jam :05</span>
</div>

</body></html>`;
}

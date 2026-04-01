import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { reports, brands as brandsApi, actions } from '../../api/client'

export default function ReportView() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' })
  const [brand, setBrand] = useState('')
  const [date, setDate] = useState(today)

  const { data: brandList = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => brandsApi.list(),
  })

  if (!brand && brandList.length > 0) setBrand(brandList[0].key)

  const { data: report, isLoading } = useQuery({
    queryKey: ['report-hourly', brand, date],
    queryFn: () => reports.hourly(brand, date),
    enabled: !!brand && !!date,
    refetchInterval: date === today ? 60000 : false,
  })

  const { data: summary } = useQuery({
    queryKey: ['report-summary', brand, date],
    queryFn: () => reports.summary(brand, date),
    enabled: !!brand && !!date,
  })

  const queryClient = useQueryClient()

  const { data: missing } = useQuery({
    queryKey: ['missing-hours', brand, date],
    queryFn: () => actions.missingHours(brand, date),
    enabled: !!brand && !!date,
  })

  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillResult, setBackfillResult] = useState(null)

  const handleBackfill = async () => {
    setBackfillLoading(true)
    setBackfillResult(null)
    try {
      const res = await actions.backfill(date, brand)
      setBackfillResult(res)
      // Refresh all data
      queryClient.invalidateQueries({ queryKey: ['report-hourly'] })
      queryClient.invalidateQueries({ queryKey: ['report-summary'] })
      queryClient.invalidateQueries({ queryKey: ['missing-hours'] })
    } catch (err) {
      setBackfillResult({ success: false, error: err.message })
    } finally {
      setBackfillLoading(false)
    }
  }

  const currentBrand = brandList.find(b => b.key === brand)
  const brandColor = currentBrand?.primary_color || '#dc2626'

  return (
    <div>
      {/* Header Controls */}
      <div className="flex items-center gap-4 mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Hourly Report</h1>
        <select value={brand} onChange={e => setBrand(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium">
          {brandList.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        {date === today && (
          <span className="text-xs bg-green-500 text-white px-2.5 py-1 rounded-full font-medium animate-pulse">
            LIVE
          </span>
        )}
      </div>

      {/* Backfill Panel */}
      {missing && (missing.missingHours.length > 0 || !missing.hasFinish) && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-orange-800 text-sm">Data Tidak Lengkap</div>
              <div className="text-xs text-orange-600 mt-1">
                {missing.missingHours.length > 0 && (
                  <span>{missing.missingHours.length} jam kosong</span>
                )}
                {missing.missingHours.length > 0 && !missing.hasFinish && <span> | </span>}
                {!missing.hasFinish && <span>FINISH belum ada</span>}
                <span className="ml-2">({missing.totalExisting}/{missing.totalExpected} terisi)</span>
              </div>
              {!missing.isToday && missing.missingHours.length > 0 && (
                <div className="text-xs text-orange-500 mt-1 italic">
                  TRX per-jam tidak bisa diambil untuk tanggal lama. REGIS &amp; FINISH bisa di-backfill.
                </div>
              )}
            </div>
            {missing.canBackfill && (
              <button onClick={handleBackfill} disabled={backfillLoading}
                className="bg-orange-600 text-white px-4 py-1.5 rounded text-xs font-medium hover:bg-orange-700 disabled:opacity-50 shrink-0">
                {backfillLoading ? 'Loading...' : 'Backfill Data'}
              </button>
            )}
          </div>
          {backfillResult && (
            <div className={`mt-2 text-xs ${backfillResult.success ? 'text-green-700 bg-green-50 p-2 rounded' : 'text-red-600'}`}>
              {backfillResult.success
                ? backfillResult.results
                  ? backfillResult.results.map((r, i) => (
                      <div key={i}>
                        {r.success
                          ? r.saved?.map((s, j) => <div key={j}>{s}</div>)
                          : <span className="text-red-600">{r.brand}: {r.error || r.message}</span>
                        }
                      </div>
                    ))
                  : backfillResult.message
                : `Error: ${backfillResult.error}`
              }
            </div>
          )}
        </div>
      )}

      {isLoading && <div className="text-gray-500 py-12 text-center">Loading...</div>}

      {report && (
        <>
          {/* Scoreboard */}
          {report.scoreboard && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <ScoreCard
                label="TRX HARI INI"
                today={report.scoreboard.trxToday}
                gap={report.scoreboard.trxGap}
                badge={report.scoreboard.trxBadge}
              />
              <ScoreCard
                label="REGIS HARI INI"
                today={report.scoreboard.regisToday}
                gap={report.scoreboard.regisGap}
                badge={report.scoreboard.regisBadge}
              />
            </div>
          )}

          {/* Projection */}
          {report.projection?.trx && (
            <div className="bg-white rounded-lg border p-3 mb-4 text-sm flex items-center gap-6">
              <div>Pace: <strong>{fmt(report.projection.trx.pace)}/jam</strong></div>
              <div>Est EOD: <strong>~{fmt(report.projection.trx.estEOD)}</strong> trx</div>
              <div>Target: <strong>{fmt(report.projection.trx.target)}</strong></div>
              <div className={report.projection.trx.selisih >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                Selisih: {fmtSign(report.projection.trx.selisih)}
              </div>
            </div>
          )}

          {/* ═══ Main Table ═══ */}
          <div className="bg-white rounded-lg border overflow-hidden mb-6">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                {/* Row 1: Group Headers */}
                <tr>
                  <th colSpan={4} className="py-2.5 text-center text-white font-bold text-sm"
                    style={{ backgroundColor: brandColor }}>
                    INDEX TRX
                  </th>
                  <th className="py-2.5 text-center bg-gray-900 text-white font-bold text-sm border-x-2 border-white"
                    rowSpan={2}>
                    JAM
                  </th>
                  <th colSpan={4} className="py-2.5 text-center text-white font-bold text-sm"
                    style={{ backgroundColor: brandColor, opacity: 0.85 }}>
                    INDEX REGIS
                  </th>
                </tr>
                {/* Row 2: Column Headers */}
                <tr className="bg-gray-100 text-[11px] text-gray-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-right font-semibold">Yesterday</th>
                  <th className="px-3 py-2 text-right font-semibold">Hari Ini</th>
                  <th className="px-3 py-2 text-right font-semibold">Selisih/Jam</th>
                  <th className="px-3 py-2 text-right font-semibold">Selisih Kmrn</th>
                  {/* JAM from rowSpan */}
                  <th className="px-3 py-2 text-right font-semibold">Yesterday</th>
                  <th className="px-3 py-2 text-right font-semibold">Hari Ini</th>
                  <th className="px-3 py-2 text-right font-semibold">Selisih/Jam</th>
                  <th className="px-3 py-2 text-right font-semibold">Selisih Kmrn</th>
                </tr>
              </thead>
              <tbody>
                {report.rows?.map((row, i) => {
                  const isCurrent = row.isCurrent
                  const isFuture = row.isFuture
                  const hasTrx = row.trx.today !== null
                  const hasRegis = row.regis.today !== null
                  const hasData = hasTrx || hasRegis
                  const isFinish = row.hour === 24

                  let rowBg = i % 2 === 0 ? 'bg-cyan-50/30' : 'bg-white'
                  if (isCurrent) rowBg = 'bg-pink-100'
                  if (isFuture) rowBg = 'bg-blue-50/50'
                  if (isFinish) rowBg = 'bg-amber-50'

                  return (
                    <tr key={row.hour} className={`${rowBg} border-t border-gray-200 ${isCurrent || isFinish ? 'font-bold' : ''}`}>
                      {/* TRX: Yesterday */}
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">
                        {fmt(row.trx.yesterday)}
                      </td>
                      {/* TRX: Hari Ini */}
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-900">
                        {hasTrx ? fmt(row.trx.today) : <span className="text-gray-300">&mdash;</span>}
                      </td>
                      {/* TRX: Selisih/Jam (per hour increment) */}
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {renderGap(row.trx.perHour)}
                      </td>
                      {/* TRX: Selisih Kmrn (gap vs yesterday) */}
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                        {renderGap(row.trx.gap)}
                      </td>

                      {/* JAM */}
                      <td className="px-2 py-1.5 text-center font-bold text-gray-800 bg-gray-100 border-x border-gray-200 text-xs whitespace-nowrap">
                        {row.label}
                      </td>

                      {/* REGIS: Yesterday */}
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">
                        {fmt(row.regis.yesterday)}
                      </td>
                      {/* REGIS: Hari Ini */}
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-900">
                        {hasRegis ? fmt(row.regis.today) : <span className="text-gray-300">&mdash;</span>}
                      </td>
                      {/* REGIS: Selisih/Jam */}
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {renderGap(row.regis.perHour)}
                      </td>
                      {/* REGIS: Selisih Kmrn */}
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                        {renderGap(row.regis.gap)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ═══ Summary Comparison ═══ */}
          {summary && <SummarySection summary={summary} />}
        </>
      )}
    </div>
  )
}

// ─── Components ───

function ScoreCard({ label, today, gap, badge }) {
  const isAhead = badge === 'AHEAD'
  const isBehind = badge === 'BEHIND'
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-3xl font-bold text-gray-900 tabular-nums">{fmt(today)}</div>
      <div className="flex items-center gap-2 mt-2">
        <span className={`text-sm font-semibold tabular-nums ${isAhead ? 'text-green-600' : isBehind ? 'text-red-600' : 'text-gray-500'}`}>
          {fmtSign(gap)}
        </span>
        <span className={`text-xs text-white px-2 py-0.5 rounded font-medium ${
          isAhead ? 'bg-green-500' : isBehind ? 'bg-red-500' : 'bg-gray-400'
        }`}>
          {badge}
        </span>
      </div>
    </div>
  )
}

function SummarySection({ summary }) {
  const comparisons = [
    { label: 'Kemarin (Finish)', sub: summary.yesterday.date, trx: summary.yesterday.trx, regis: summary.yesterday.regis },
    { label: 'Rata-rata 7 Hari', sub: 'last 7 days', trx: summary.avg7days.trx, regis: summary.avg7days.regis },
    { label: '7 Hari Lalu', sub: summary.weekAgo.date, trx: summary.weekAgo.trx, regis: summary.weekAgo.regis },
    { label: 'Rata-rata 30 Hari', sub: 'last 30 days', trx: summary.avg30days.trx, regis: summary.avg30days.regis },
    { label: '30 Hari Lalu', sub: summary.monthAgo.date, trx: summary.monthAgo.trx, regis: summary.monthAgo.regis },
  ]

  const todayTrx = summary.today.trx
  const todayRegis = summary.today.regis

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="px-4 py-3 bg-gray-800 text-white font-bold text-sm uppercase tracking-wide">
        Summary Perbandingan
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-[11px] text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-2 text-left">Perbandingan</th>
            <th className="px-4 py-2 text-right">TRX</th>
            <th className="px-4 py-2 text-right">vs Hari Ini</th>
            <th className="px-4 py-2 text-right">%</th>
            <th className="px-4 py-2 text-right border-l">REGIS</th>
            <th className="px-4 py-2 text-right">vs Hari Ini</th>
            <th className="px-4 py-2 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {/* Current row */}
          <tr className="border-t bg-green-50 font-semibold">
            <td className="px-4 py-2.5">
              <div>Hari Ini</div>
              <div className="text-xs text-gray-400 font-normal">Jam {summary.today.hour}:00</div>
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{fmt(todayTrx)}</td>
            <td className="px-4 py-2.5 text-right text-gray-400">&mdash;</td>
            <td className="px-4 py-2.5 text-right text-gray-400">&mdash;</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 border-l">{fmt(todayRegis)}</td>
            <td className="px-4 py-2.5 text-right text-gray-400">&mdash;</td>
            <td className="px-4 py-2.5 text-right text-gray-400">&mdash;</td>
          </tr>

          {comparisons.map((c, i) => {
            const trxDiff = todayTrx - c.trx
            const regisDiff = todayRegis - c.regis
            const trxPct = c.trx > 0 ? ((trxDiff / c.trx) * 100).toFixed(1) : null
            const regisPct = c.regis > 0 ? ((regisDiff / c.regis) * 100).toFixed(1) : null

            return (
              <tr key={i} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-gray-800">{c.label}</div>
                  <div className="text-xs text-gray-400">{c.sub}</div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmt(c.trx)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  {renderGap(c.trx > 0 || todayTrx > 0 ? trxDiff : null)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                  {trxPct !== null ? renderPct(trxPct) : <span className="text-gray-300">&mdash;</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 border-l">{fmt(c.regis)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  {renderGap(c.regis > 0 || todayRegis > 0 ? regisDiff : null)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                  {regisPct !== null ? renderPct(regisPct) : <span className="text-gray-300">&mdash;</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Helpers ───

function fmt(n) {
  if (n === null || n === undefined) return '\u2014'
  return n.toLocaleString('id-ID')
}

function fmtSign(n) {
  if (n === null || n === undefined) return '\u2014'
  return (n > 0 ? '+' : '') + n.toLocaleString('id-ID')
}

function renderGap(n) {
  if (n === null || n === undefined) return <span className="text-gray-300">&mdash;</span>
  if (n > 0) return <span className="text-green-600">+{n.toLocaleString('id-ID')}</span>
  if (n < 0) return <span className="text-red-600">{n.toLocaleString('id-ID')}</span>
  return <span className="text-gray-400">0</span>
}

function renderPct(pct) {
  const v = parseFloat(pct)
  if (v >= 0) return <span className="text-green-600">+{pct}%</span>
  return <span className="text-red-600">{pct}%</span>
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reports, brands as brandsApi } from '../api/client'

export default function ReportView() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' })
  const [brand, setBrand] = useState('')
  const [date, setDate] = useState(today)

  const { data: brandList = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => brandsApi.list(),
  })

  // Auto-select first brand
  if (!brand && brandList.length > 0) setBrand(brandList[0].key)

  const { data: report, isLoading } = useQuery({
    queryKey: ['report-hourly', brand, date],
    queryFn: () => reports.hourly(brand, date),
    enabled: !!brand && !!date,
    refetchInterval: date === today ? 60000 : false,
  })

  const fmt = (n) => n !== null && n !== undefined ? n.toLocaleString('id-ID') : '—'
  const fmtGap = (n) => {
    if (n === null || n === undefined) return '—'
    const prefix = n > 0 ? '+' : ''
    return prefix + n.toLocaleString('id-ID')
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Hourly Report</h1>
        <select value={brand} onChange={e => setBrand(e.target.value)}
          className="border rounded px-3 py-2 text-sm">
          {brandList.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="border rounded px-3 py-2 text-sm" />
        {date === today && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">LIVE</span>}
      </div>

      {isLoading && <div className="text-gray-500">Loading...</div>}

      {report && (
        <>
          {/* Scoreboard */}
          {report.scoreboard && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <ScoreCard label="TRX HARI INI" today={report.scoreboard.trxToday}
                gap={report.scoreboard.trxGap} badge={report.scoreboard.trxBadge} />
              <ScoreCard label="REGIS HARI INI" today={report.scoreboard.regisToday}
                gap={report.scoreboard.regisGap} badge={report.scoreboard.regisBadge} />
            </div>
          )}

          {/* Projection */}
          {report.projection?.trx && (
            <div className="bg-white rounded-lg border p-4 mb-6 text-sm">
              <div className="flex gap-6">
                <span>Pace: <strong>{report.projection.trx.pace}/jam</strong></span>
                <span>Est EOD: <strong>~{fmt(report.projection.trx.estEOD)}</strong> trx</span>
                <span>Target: <strong>{fmt(report.projection.trx.target)}</strong></span>
                <span className={report.projection.trx.selisih >= 0 ? 'text-green-600' : 'text-red-600'}>
                  Selisih: {fmtGap(report.projection.trx.selisih)}
                </span>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-lg border overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th colSpan={4} className="px-2 py-2 text-center text-blue-700 border-b">INDEX TRX</th>
                  <th className="px-2 py-2 text-center border-b border-x bg-gray-100">JAM</th>
                  <th colSpan={4} className="px-2 py-2 text-center text-purple-700 border-b">INDEX REGIS</th>
                </tr>
                <tr className="text-xs text-gray-500">
                  <th className="px-2 py-1 text-right">KMRN</th>
                  <th className="px-2 py-1 text-right">HARI INI</th>
                  <th className="px-2 py-1 text-right">/JAM</th>
                  <th className="px-2 py-1 text-right">SISA</th>
                  <th className="px-2 py-1 text-center border-x bg-gray-50"></th>
                  <th className="px-2 py-1 text-right">KMRN</th>
                  <th className="px-2 py-1 text-right">HARI INI</th>
                  <th className="px-2 py-1 text-right">/JAM</th>
                  <th className="px-2 py-1 text-right">SISA</th>
                </tr>
              </thead>
              <tbody>
                {report.rows?.map(row => (
                  <tr key={row.hour} className={
                    row.isCurrent ? 'bg-yellow-50 font-semibold' :
                    row.isFuture ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'
                  }>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row.trx.yesterday)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmt(row.trx.today)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${row.trx.perHour > 0 ? 'text-green-600' : ''}`}>{fmtGap(row.trx.perHour)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${(row.trx.gap || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtGap(row.trx.gap)}</td>
                    <td className="px-2 py-1.5 text-center border-x bg-gray-50 font-medium text-xs">{row.label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row.regis.yesterday)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmt(row.regis.today)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${row.regis.perHour > 0 ? 'text-green-600' : ''}`}>{fmtGap(row.regis.perHour)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${(row.regis.gap || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtGap(row.regis.gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function ScoreCard({ label, today, gap, badge }) {
  const badgeColor = badge === 'AHEAD' ? 'bg-green-500' : badge === 'BEHIND' ? 'bg-red-500' : 'bg-gray-500'
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-3xl font-bold text-gray-900">{today?.toLocaleString('id-ID')}</div>
      <div className="flex items-center gap-2 mt-1">
        <span className={`text-sm ${gap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {gap >= 0 ? '+' : ''}{gap?.toLocaleString('id-ID')}
        </span>
        <span className={`text-xs text-white px-2 py-0.5 rounded ${badgeColor}`}>{badge}</span>
      </div>
    </div>
  )
}

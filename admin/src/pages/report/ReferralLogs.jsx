import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { monitoring } from '../../api/client'

export default function ReferralLogs() {
  const [filters, setFilters] = useState({
    type: 'referral-report,referral-backfill',
    status: '',
    limit: '50',
    offset: '0',
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['referral-logs', filters],
    queryFn: () => monitoring.logs(filters),
    refetchInterval: 30000,
  })

  const setType = (t) => setFilters({ ...filters, type: t, offset: '0' })
  const setStatus = (e) => setFilters({ ...filters, status: e.target.value, offset: '0' })

  const nextPage = () => {
    const newOffset = parseInt(filters.offset) + parseInt(filters.limit)
    if (newOffset < (data?.total || 0)) setFilters({ ...filters, offset: String(newOffset) })
  }
  const prevPage = () => {
    setFilters({ ...filters, offset: String(Math.max(0, parseInt(filters.offset) - parseInt(filters.limit))) })
  }

  const fmtTime = (t) => t ? new Date(t).toLocaleString('id-ID', { timeZone: 'Asia/Phnom_Penh', hour12: false }) : '—'

  const badge = (type) => {
    if (type === 'referral-report') return <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">report</span>
    if (type === 'referral-backfill') return <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700">backfill</span>
    return <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700">{type}</span>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Referral Logs</h1>
        <button onClick={() => refetch()} className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-xs hover:bg-gray-300">Refresh</button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Log aktivitas pengiriman referral report ke Telegram dan backfill snapshot. Terpisah dari log Hourly Report Brand.
      </p>

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <select value={filters.type} onChange={e => setType(e.target.value)} className="border rounded px-2 py-1.5 text-xs">
          <option value="referral-report,referral-backfill">Semua Referral</option>
          <option value="referral-report">Report (TG send)</option>
          <option value="referral-backfill">Backfill</option>
        </select>
        <select value={filters.status} onChange={setStatus} className="border rounded px-2 py-1.5 text-xs">
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
      </div>

      {isLoading && <div className="text-gray-400 text-sm py-8 text-center">Loading...</div>}

      {data && (
        <>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Divisi</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-left">Message</th>
                  <th className="px-3 py-2 text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map(log => (
                  <tr key={log.id} className={`border-t ${log.status === 'error' ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{fmtTime(log.created_at)}</td>
                    <td className="px-3 py-1.5">{badge(log.job_type)}</td>
                    <td className="px-3 py-1.5 font-medium">{log.brand_key}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded ${log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 max-w-md truncate" title={log.message}>{log.message}</td>
                    <td className="px-3 py-1.5 text-right text-gray-400">{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.logs.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">No referral logs found.</div>
            )}
          </div>

          <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
            <span>{parseInt(filters.offset) + 1}-{Math.min(parseInt(filters.offset) + data.logs.length, data.total)} of {data.total}</span>
            <div className="flex gap-1">
              <button onClick={prevPage} disabled={parseInt(filters.offset) === 0} className="px-2 py-1 border rounded disabled:opacity-30">Prev</button>
              <button onClick={nextPage} disabled={parseInt(filters.offset) + parseInt(filters.limit) >= data.total} className="px-2 py-1 border rounded disabled:opacity-30">Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

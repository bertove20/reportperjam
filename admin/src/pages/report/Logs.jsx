import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { monitoring, brands as brandsApi } from '../../api/client'

const EXCLUDED_TYPES = 'referral-report,referral-backfill'

export default function Logs() {
  const [filters, setFilters] = useState({ type: '', typeNotIn: EXCLUDED_TYPES, brand: '', status: '', limit: '50', offset: '0' })
  const [tab, setTab] = useState('logs') // 'logs' or 'summary'

  const { data: brandList = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => brandsApi.list(false),
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['logs', filters],
    queryFn: () => monitoring.logs(filters),
    refetchInterval: 30000,
    enabled: tab === 'logs',
  })

  const { data: summary } = useQuery({
    queryKey: ['logs-summary'],
    queryFn: () => fetch('/api/logs/brand-summary', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).then(r => r.json()),
    refetchInterval: 30000,
    enabled: tab === 'summary',
  })

  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value, offset: '0' })

  const nextPage = () => {
    const newOffset = parseInt(filters.offset) + parseInt(filters.limit)
    if (newOffset < (data?.total || 0)) setFilters({ ...filters, offset: String(newOffset) })
  }
  const prevPage = () => {
    setFilters({ ...filters, offset: String(Math.max(0, parseInt(filters.offset) - parseInt(filters.limit))) })
  }

  const fmtTime = (t) => t ? new Date(t).toLocaleString('id-ID', { timeZone: 'Asia/Phnom_Penh', hour12: false }) : '—'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Job Logs</h1>
        <button onClick={() => refetch()} className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-xs hover:bg-gray-300">Refresh</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button onClick={() => setTab('summary')}
          className={`px-3 py-1.5 text-xs rounded ${tab === 'summary' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Per Brand
        </button>
        <button onClick={() => setTab('logs')}
          className={`px-3 py-1.5 text-xs rounded ${tab === 'logs' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          All Logs
        </button>
      </div>

      {/* Tab: Brand Summary */}
      {tab === 'summary' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Brand</th>
                <th className="px-4 py-2 text-center text-green-700">Success (7d)</th>
                <th className="px-4 py-2 text-center text-red-700">Error (7d)</th>
                <th className="px-4 py-2 text-left">Last Success</th>
                <th className="px-4 py-2 text-left">Last Error</th>
                <th className="px-4 py-2 text-left">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(summary) ? summary : []).map(s => (
                <tr key={s.brand_key} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">
                    <button onClick={() => { setTab('logs'); setFilters({ ...filters, brand: s.brand_key, offset: '0' }) }}
                      className="text-blue-600 hover:underline">{s.brand_key}</button>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs">{s.success_count}</span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {parseInt(s.error_count) > 0
                      ? <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs">{s.error_count}</span>
                      : <span className="text-gray-300">0</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{fmtTime(s.last_success)}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{fmtTime(s.last_error)}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{fmtTime(s.last_activity)}</td>
                </tr>
              ))}
              {(!summary || summary.length === 0) && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No data in last 7 days</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: All Logs */}
      {tab === 'logs' && (
        <>
          {/* Filters */}
          <div className="flex gap-2 mb-3">
            <select value={filters.type} onChange={set('type')} className="border rounded px-2 py-1.5 text-xs">
              <option value="">All Types</option>
              <option value="fetch">Fetch</option>
              <option value="send">Send</option>
              <option value="finish">Finish</option>
              <option value="backfill">Backfill</option>
            </select>
            <select value={filters.brand} onChange={set('brand')} className="border rounded px-2 py-1.5 text-xs">
              <option value="">All Brands</option>
              {brandList.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
            </select>
            <select value={filters.status} onChange={set('status')} className="border rounded px-2 py-1.5 text-xs">
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
                      <th className="px-3 py-2 text-left">Brand</th>
                      <th className="px-3 py-2 text-center">Status</th>
                      <th className="px-3 py-2 text-left">Message</th>
                      <th className="px-3 py-2 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.logs.map(log => (
                      <tr key={log.id} className={`border-t ${log.status === 'error' ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{fmtTime(log.created_at)}</td>
                        <td className="px-3 py-1.5">{log.job_type}</td>
                        <td className="px-3 py-1.5 font-medium">{log.brand_key}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded ${log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-gray-600 max-w-xs truncate">{log.message}</td>
                        <td className="px-3 py-1.5 text-right text-gray-400">{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.logs.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">No logs found.</div>
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
        </>
      )}
    </div>
  )
}

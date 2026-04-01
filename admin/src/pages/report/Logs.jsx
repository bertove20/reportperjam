import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { monitoring, brands as brandsApi } from '../../api/client'

export default function Logs() {
  const [filters, setFilters] = useState({ type: '', brand: '', status: '', limit: '50', offset: '0' })

  const { data: brandList = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => brandsApi.list(false),
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['logs', filters],
    queryFn: () => monitoring.logs(filters),
    refetchInterval: 30000,
  })

  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value, offset: '0' })

  const nextPage = () => {
    const newOffset = parseInt(filters.offset) + parseInt(filters.limit)
    if (newOffset < (data?.total || 0)) {
      setFilters({ ...filters, offset: String(newOffset) })
    }
  }
  const prevPage = () => {
    const newOffset = Math.max(0, parseInt(filters.offset) - parseInt(filters.limit))
    setFilters({ ...filters, offset: String(newOffset) })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Job Logs</h1>
        <button onClick={() => refetch()} className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300">
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select value={filters.type} onChange={set('type')}
          className="border rounded px-3 py-2 text-sm">
          <option value="">All Types</option>
          <option value="fetch">Fetch</option>
          <option value="send">Send</option>
          <option value="finish">Finish</option>
        </select>
        <select value={filters.brand} onChange={set('brand')}
          className="border rounded px-3 py-2 text-sm">
          <option value="">All Brands</option>
          {brandList.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
        </select>
        <select value={filters.status} onChange={set('status')}
          className="border rounded px-3 py-2 text-sm">
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
      </div>

      {isLoading && <div className="text-gray-500">Loading...</div>}

      {data && (
        <>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Brand</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-left">Message</th>
                  <th className="px-4 py-2 text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map(log => (
                  <tr key={log.id} className={`border-t ${log.status === 'error' ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">
                      {log.created_at?.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="px-4 py-2">{log.job_type}</td>
                    <td className="px-4 py-2">{log.brand_key}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600 text-xs max-w-xs truncate">{log.message}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.logs.length === 0 && (
              <div className="text-center py-8 text-gray-500">No logs found.</div>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>Showing {parseInt(filters.offset) + 1}-{Math.min(parseInt(filters.offset) + data.logs.length, data.total)} of {data.total}</span>
            <div className="flex gap-2">
              <button onClick={prevPage} disabled={parseInt(filters.offset) === 0}
                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50">Prev</button>
              <button onClick={nextPage} disabled={parseInt(filters.offset) + parseInt(filters.limit) >= data.total}
                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50">Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

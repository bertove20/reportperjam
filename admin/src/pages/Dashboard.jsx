import { useQuery } from '@tanstack/react-query'
import { monitoring, actions } from '../api/client'

export default function Dashboard() {
  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['status'],
    queryFn: monitoring.status,
    refetchInterval: 30000,
  })

  if (isLoading) return <div className="text-gray-500">Loading...</div>

  const handleFetchNow = async () => {
    await actions.fetchNow()
    alert('Fetch started for all brands')
  }

  const handleReportNow = async () => {
    await actions.reportNow()
    alert('Report started for all brands')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Uptime: {status?.uptimeFormatted}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleFetchNow} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            Fetch Now
          </button>
          <button onClick={handleReportNow} className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700">
            Report Now
          </button>
          <button onClick={() => refetch()} className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300">
            Refresh
          </button>
        </div>
      </div>

      {/* Brand Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {status?.brands?.map(brand => (
          <BrandCard key={brand.key} brand={brand} />
        ))}
      </div>

      {/* Stats */}
      {status?.stats?.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3 text-gray-900">Last 24h Stats</h2>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Job Type</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Count</th>
                  <th className="px-4 py-2 text-right">Last Run</th>
                </tr>
              </thead>
              <tbody>
                {status.stats.map((s, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2">{s.job_type}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${s.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">{s.count}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{s.last_at?.replace('T', ' ').slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function BrandCard({ brand }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">{brand.name}</h3>
        <span className={`text-xs px-2 py-0.5 rounded ${brand.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {brand.engine}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Last Fetch</span>
          <span className={brand.lastFetch?.status === 'error' ? 'text-red-600' : 'text-gray-900'}>
            {brand.lastFetch ? `${brand.lastFetch.status} - ${brand.lastFetch.message || ''}` : 'N/A'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Last Send</span>
          <span className={brand.lastSend?.status === 'error' ? 'text-red-600' : 'text-gray-900'}>
            {brand.lastSend ? brand.lastSend.status : 'N/A'}
          </span>
        </div>
        {brand.lastFetch?.at && (
          <div className="text-xs text-gray-400 text-right">
            {brand.lastFetch.at.replace('T', ' ').slice(0, 19)}
          </div>
        )}
      </div>
    </div>
  )
}

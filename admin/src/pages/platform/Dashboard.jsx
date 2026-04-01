import { useQuery } from '@tanstack/react-query'
import { platform } from '../../api/client'

export default function PlatformDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['platform-dashboard'], queryFn: platform.dashboard })

  if (isLoading) return <div className="text-gray-400 py-12 text-center text-sm">Loading...</div>

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-5">Platform Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card label="Total Tenants" value={data?.totalTenants} />
        <Card label="Total Users" value={data?.totalUsers} />
        <Card label="Plans" value={data?.planStats?.length} />
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h2 className="text-sm font-semibold mb-3">Tenants per Plan</h2>
        <div className="space-y-2">
          {data?.planStats?.map((p, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-600">{p.name}</span>
              <span className="font-medium">{p.tenant_count} tenants</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Card({ label, value }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value || 0}</div>
    </div>
  )
}

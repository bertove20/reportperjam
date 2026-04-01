import { useQuery } from '@tanstack/react-query'
import { home } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { Link } from 'react-router-dom'

const fmt = (n) => parseFloat(n || 0).toLocaleString('id-ID')

export default function Home() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({ queryKey: ['home-dashboard'], queryFn: home.dashboard, refetchInterval: 60000 })

  if (isLoading) return <div className="text-gray-400 text-sm py-12 text-center">Loading...</div>

  const r = data?.report || {}
  const f = data?.finance || {}

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Welcome, {user?.full_name || user?.username}</h1>
        <p className="text-xs text-gray-500 mt-1">{data?.month}/{data?.year} overview</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Report Brands" value={r.totalBrands} sub={`${r.brandsActive} active today`} color="blue" />
        <StatCard label="Latest Hour" value={r.latestHour ? `${r.latestHour}:00` : 'N/A'} sub="Last fetch" color="blue" />
        <StatCard label="Expense USD" value={`$${fmt(f.expenseThisMonth?.usd)}`} sub={`${f.txCount} transactions`} color="emerald" />
        <StatCard label="Wallet Balance" value={`$${fmt(f.walletBalance?.usd)}`} sub={`Rp ${fmt(f.walletBalance?.idr)}`} color="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Report Bot Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Report Bot</h2>
            <Link to="/report" className="text-[10px] text-blue-500 hover:underline">View All</Link>
          </div>
          <div className="space-y-2">
            {r.brands?.map(b => (
              <div key={b.key} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 dark:text-gray-300">{b.name}</span>
                <span className={b.lastStatus === 'success' ? 'text-green-600' : b.lastStatus === 'error' ? 'text-red-500' : 'text-gray-400'}>
                  {b.lastStatus}
                </span>
              </div>
            ))}
            {!r.brands?.length && <p className="text-xs text-gray-400">No brands configured</p>}
          </div>
        </div>

        {/* Finance Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Keuangan</h2>
            <Link to="/finance" className="text-[10px] text-emerald-500 hover:underline">View All</Link>
          </div>
          <div className="space-y-2 text-xs">
            <Row label="Expense (USD)" value={`$${fmt(f.expenseThisMonth?.usd)}`} />
            <Row label="Expense (IDR)" value={`Rp ${fmt(f.expenseThisMonth?.idr)}`} />
            <Row label="Balance (USD)" value={`$${fmt(f.walletBalance?.usd)}`} />
            <Row label="Balance (IDR)" value={`Rp ${fmt(f.walletBalance?.idr)}`} />
            <Row label="Loan Outstanding" value={`$${fmt(f.loanOutstanding)}`} warn={f.loanOutstanding > 0} />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 flex gap-2 flex-wrap">
        <Link to="/report/hourly" className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">View Hourly Report</Link>
        <Link to="/finance/transactions" className="px-3 py-1.5 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100">Add Transaction</Link>
        <Link to="/report/brands" className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Manage Brands</Link>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  const colors = { blue: 'border-l-blue-500', emerald: 'border-l-emerald-500' }
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 border-l-4 ${colors[color]} p-3`}>
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{value}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>
    </div>
  )
}

function Row({ label, value, warn }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`font-medium ${warn ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>{value}</span>
    </div>
  )
}

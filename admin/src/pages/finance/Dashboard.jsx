import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { finance } from '../../api/client'

const fmt = (n, c = 'USD') => n != null ? parseFloat(n).toLocaleString('id-ID', { minimumFractionDigits: c === 'IDR' ? 0 : 2 }) : '0'

export default function FinanceDashboard() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  const { data, isLoading } = useQuery({
    queryKey: ['finance-dashboard', month, year],
    queryFn: () => finance.dashboard(month, year),
  })

  if (isLoading) return <div className="text-gray-400 text-sm py-12 text-center">Loading...</div>
  if (!data) return null

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-xl font-bold text-gray-900">Finance Dashboard</h1>
        <select value={month} onChange={e => setMonth(+e.target.value)} className="border rounded px-2 py-1 text-sm">
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input type="number" value={year} onChange={e => setYear(+e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <Card label="Expense USD" value={`$${fmt(data.expense?.usd)}`} />
        <Card label="Expense IDR" value={`Rp ${fmt(data.expense?.idr, 'IDR')}`} />
        <Card label="Budget USD" value={`$${fmt(data.budget?.usd)}`} />
        <Card label="Budget IDR" value={`Rp ${fmt(data.budget?.idr, 'IDR')}`} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* By Brand */}
        <div className="bg-white rounded-lg border p-4">
          <h2 className="text-sm font-semibold mb-3">By Brand</h2>
          <div className="space-y-1.5">
            {data.byBrand?.map(b => (
              <div key={b.id} className="flex justify-between text-xs">
                <span className="text-gray-700">{b.name}</span>
                <span className="tabular-nums">${fmt(b.expense_usd)} <span className="text-gray-400">({b.tx_count} tx)</span></span>
              </div>
            ))}
            {(!data.byBrand?.length) && <p className="text-xs text-gray-400">No data</p>}
          </div>
        </div>

        {/* Balances */}
        <div className="bg-white rounded-lg border p-4">
          <h2 className="text-sm font-semibold mb-3">Wallet Balances</h2>
          <div className="space-y-1.5">
            {data.balances?.map(b => (
              <div key={b.id} className="flex justify-between text-xs">
                <span className="text-gray-700">{b.bank_name} — {b.name}</span>
                <span className="tabular-nums font-medium">{b.currency === 'IDR' ? 'Rp' : '$'} {fmt(b.current_balance, b.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Team */}
        <div className="bg-white rounded-lg border p-4">
          <h2 className="text-sm font-semibold mb-3">By Team</h2>
          <div className="space-y-1.5">
            {data.byTeam?.map((t, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-gray-700">{t.name || 'No Team'}</span>
                <span className="tabular-nums">${fmt(t.expense_usd)} ({t.tx_count} tx)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent */}
        <div className="bg-white rounded-lg border p-4">
          <h2 className="text-sm font-semibold mb-3">Recent Transactions</h2>
          <div className="space-y-1.5">
            {data.recent?.map(t => (
              <div key={t.id} className="flex justify-between text-xs">
                <span className="text-gray-700 truncate mr-2">{t.brand_name} — {t.description || t.category_name}</span>
                <span className="tabular-nums shrink-0">{t.currency === 'IDR' ? 'Rp' : '$'}{fmt(t.amount, t.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ label, value }) {
  return (
    <div className="bg-white rounded-lg border p-3">
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

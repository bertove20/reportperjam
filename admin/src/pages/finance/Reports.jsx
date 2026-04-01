import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { finance } from '../../api/client'

const fmt = (n, c = 'USD') => parseFloat(n || 0).toLocaleString('id-ID', { minimumFractionDigits: c === 'IDR' ? 0 : 2 })

export default function Reports() {
  const now = new Date()
  const [filters, setFilters] = useState({ month: now.getMonth() + 1, year: now.getFullYear(), brand_id: '' })
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value })

  const { data: brands } = useQuery({ queryKey: ['fin-brands'], queryFn: finance.brands.list })
  const { data, isLoading } = useQuery({
    queryKey: ['fin-reports', filters],
    queryFn: () => finance.reports(filters),
  })

  const brandList = brands?.brands || brands || []
  const MiniTable = ({ title, rows, cols }) => (
    <div className="bg-white rounded-lg border p-4 mb-4">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>
      <table className="w-full text-xs">
        <thead><tr>{cols.map(c => <th key={c.key} className={`px-2 py-1 text-${c.align || 'left'} text-gray-500`}>{c.label}</th>)}</tr></thead>
        <tbody>{(rows || []).map((r, i) => (
          <tr key={i} className="border-t"><td className="px-2 py-1">{r.name || r.label}</td>
            {cols.slice(1).map(c => <td key={c.key} className={`px-2 py-1 text-${c.align || 'left'} tabular-nums`}>{c.render ? c.render(r) : r[c.key]}</td>)}
          </tr>
        ))}</tbody>
      </table>
      {(!rows?.length) && <p className="text-xs text-gray-400 py-2">No data</p>}
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-xl font-bold text-gray-900">Finance Reports</h1>
        <select value={filters.month} onChange={set('month')} className="border rounded px-2 py-1 text-sm">
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>Month {m}</option>)}
        </select>
        <input type="number" value={filters.year} onChange={set('year')} className="border rounded px-2 py-1 text-sm w-20" />
        <select value={filters.brand_id} onChange={set('brand_id')} className="border rounded px-2 py-1 text-sm">
          <option value="">All Brands</option>
          {brandList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-gray-400 text-sm py-12 text-center">Loading...</div>}

      {data && (
        <>
          {data.grandTotal && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white rounded-lg border p-3"><div className="text-[10px] text-gray-500 uppercase">Total USD</div><div className="text-lg font-bold">${fmt(data.grandTotal.usd)}</div></div>
              <div className="bg-white rounded-lg border p-3"><div className="text-[10px] text-gray-500 uppercase">Total IDR</div><div className="text-lg font-bold">Rp {fmt(data.grandTotal.idr, 'IDR')}</div></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <MiniTable title="By Brand" rows={data.byBrand} cols={[
              { key: 'name', label: 'Brand' },
              { key: 'expense_usd', label: 'USD', align: 'right', render: r => `$${fmt(r.expense_usd)}` },
              { key: 'tx_count', label: 'TX', align: 'right' },
            ]} />
            <MiniTable title="By Team" rows={data.byTeam} cols={[
              { key: 'name', label: 'Team' },
              { key: 'expense_usd', label: 'USD', align: 'right', render: r => `$${fmt(r.expense_usd)}` },
              { key: 'tx_count', label: 'TX', align: 'right' },
            ]} />
            <MiniTable title="By Payment Method" rows={data.byPayment} cols={[
              { key: 'name', label: 'Method' },
              { key: 'expense_usd', label: 'USD', align: 'right', render: r => `$${fmt(r.expense_usd)}` },
              { key: 'tx_count', label: 'TX', align: 'right' },
            ]} />
          </div>
        </>
      )}
    </div>
  )
}

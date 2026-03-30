import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { reports } from '../api/client'

export default function Comparison() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' })
  const [date, setDate] = useState(today)

  const { data, isLoading } = useQuery({
    queryKey: ['comparison', date],
    queryFn: () => reports.comparison(date),
    enabled: !!date,
  })

  const chartData = data?.brands?.map(b => ({
    name: b.brand,
    TRX: b.trx,
    REGIS: b.regis,
  })) || []

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Brand Comparison</h1>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="border rounded px-3 py-2 text-sm" />
      </div>

      {isLoading && <div className="text-gray-500">Loading...</div>}

      {chartData.length > 0 && (
        <>
          <div className="bg-white rounded-lg border p-4 mb-6">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="TRX" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="REGIS" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Brand</th>
                  <th className="px-4 py-2 text-right">TRX</th>
                  <th className="px-4 py-2 text-right">REGIS</th>
                  <th className="px-4 py-2 text-right">TRX Gap</th>
                  <th className="px-4 py-2 text-right">REGIS Gap</th>
                  <th className="px-4 py-2 text-right">Last Hour</th>
                </tr>
              </thead>
              <tbody>
                {data.brands.map(b => (
                  <tr key={b.brand} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{b.brand}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.trx?.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.regis?.toLocaleString('id-ID')}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${b.trxGap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {b.trxGap >= 0 ? '+' : ''}{b.trxGap?.toLocaleString('id-ID')}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${b.regisGap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {b.regisGap >= 0 ? '+' : ''}{b.regisGap?.toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{b.lastHour}:00</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isLoading && chartData.length === 0 && (
        <div className="text-center py-12 text-gray-500">No data for this date.</div>
      )}
    </div>
  )
}

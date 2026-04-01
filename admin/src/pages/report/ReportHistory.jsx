import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { reports, brands as brandsApi } from '../../api/client'

export default function ReportHistory() {
  const [brand, setBrand] = useState('')
  const [range, setRange] = useState(14)

  const { data: brandList = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => brandsApi.list(),
  })

  if (!brand && brandList.length > 0) setBrand(brandList[0].key)

  const to = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' })
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - range)
  const from = fromDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' })

  const { data, isLoading } = useQuery({
    queryKey: ['chart-data', brand, from, to],
    queryFn: () => reports.chartData(brand, from, to),
    enabled: !!brand,
  })

  const chartData = data?.dailyTrend?.map(d => ({
    date: d.date.slice(5),
    TRX: d.trx,
    REGIS: d.regis,
  })) || []

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Report History</h1>
        <select value={brand} onChange={e => setBrand(e.target.value)}
          className="border rounded px-3 py-2 text-sm">
          {brandList.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
        </select>
        <select value={range} onChange={e => setRange(parseInt(e.target.value))}
          className="border rounded px-3 py-2 text-sm">
          <option value={7}>7 hari</option>
          <option value={14}>14 hari</option>
          <option value={30}>30 hari</option>
        </select>
      </div>

      {isLoading && <div className="text-gray-500">Loading...</div>}

      {chartData.length > 0 && (
        <>
          <div className="bg-white rounded-lg border p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Daily TRX Trend</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="TRX" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg border p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Daily REGIS Trend</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="REGIS" stroke="#7c3aed" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-right">TRX (FINISH)</th>
                  <th className="px-4 py-2 text-right">REGIS (FINISH)</th>
                </tr>
              </thead>
              <tbody>
                {[...chartData].reverse().map(d => (
                  <tr key={d.date} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2">{d.date}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{d.TRX?.toLocaleString('id-ID') || '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{d.REGIS?.toLocaleString('id-ID') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isLoading && chartData.length === 0 && (
        <div className="text-center py-12 text-gray-500">No history data available for this date range.</div>
      )}
    </div>
  )
}

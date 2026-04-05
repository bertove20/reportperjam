import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { referrals as referralsApi, admin } from '../../api/client'

export default function ReferralsDashboard() {
  const today = new Date().toISOString().slice(0, 10)
  const [divisionId, setDivisionId] = useState('')
  const [date, setDate] = useState(today)

  const { data: divisionList = [] } = useQuery({
    queryKey: ['admin-divisions'],
    queryFn: () => admin.divisions.list(),
  })
  const divisions = useMemo(() => divisionList.divisions || divisionList || [], [divisionList])

  // Auto-select first division
  if (!divisionId && divisions.length > 0) setDivisionId(String(divisions[0].id))

  const { data: dashData, isLoading, refetch } = useQuery({
    queryKey: ['referrals-dashboard', divisionId, date],
    queryFn: () => referralsApi.dashboard(divisionId, date),
    enabled: !!divisionId,
  })

  const items = dashData?.items || []
  const todayDay = parseInt(date.split('-')[2])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Referral Dashboard</h1>
        <button onClick={() => refetch()} className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200">
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Divisi</label>
          <select value={divisionId} onChange={e => setDivisionId(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm min-w-[200px]">
            <option value="">-- pilih divisi --</option>
            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Tanggal Referensi</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="text-xs text-gray-500 ml-2">
          Menampilkan data sepanjang bulan yang memuat tanggal ini
        </div>
      </div>

      {isLoading && <div className="text-gray-500 text-center py-8">Loading...</div>}

      {!isLoading && items.length === 0 && (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          Tidak ada referral aktif untuk divisi ini. Tambahkan di halaman Referrals.
        </div>
      )}

      {items.map((item) => (
        <ReferralCard key={`${item.brand_key}-${item.referral_code}`} item={item} todayDay={todayDay} />
      ))}
    </div>
  )
}

function ReferralCard({ item, todayDay }) {
  const { brand_name, brand_color, referral_code, display_name, days } = item

  // Totals
  const totalNew = days.reduce((a, d) => a + (d.new_regis || 0), 0)
  const totalDepo = days.reduce((a, d) => a + (d.depo_regis || 0), 0)
  const totalRatio = (totalNew + totalDepo) > 0
    ? ((totalDepo / (totalNew + totalDepo)) * 100).toFixed(1) + '%'
    : '—'

  // Chart data
  const chartData = days.map(d => ({
    day: d.day,
    'New Regis': d.new_regis || 0,
    'New Deposit': d.depo_regis || 0,
  }))

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Brand banner */}
      <div className="flex items-center" style={{ background: '#fbbf24' }}>
        <div className="flex flex-col min-w-[240px]">
          <div className="bg-gray-900 text-white text-center font-bold py-2 text-sm tracking-wider">
            SUNTIK TRAFFIC
          </div>
          <div className="bg-green-200 text-green-900 text-center font-bold py-2 text-xs font-mono border-t border-gray-900">
            ID REFF : {referral_code}
          </div>
        </div>
        <div className="flex-1 text-center text-2xl font-black text-gray-900 tracking-wider py-3">
          {brand_name}
        </div>
        <div className="pr-4 text-right text-xs text-gray-700">
          <div style={{ background: brand_color, color: 'white', padding: '4px 10px', borderRadius: 4, fontWeight: 700 }}>
            {display_name || referral_code}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-px bg-gray-200">
        <Stat label="Total New Regis" value={totalNew} color="text-red-600" />
        <Stat label="Total New Deposit" value={totalDepo} color="text-blue-600" />
        <Stat label="Rata-rata/Hari" value={(totalNew / days.length).toFixed(1)} subValue={`& ${(totalDepo / days.length).toFixed(1)}`} color="text-gray-700" />
        <Stat label="Persentase Overall" value={totalRatio} color="text-green-600" />
      </div>

      {/* Day-by-day table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            <tr>
              <td className="bg-green-200 text-green-900 font-bold px-2 py-1 border border-gray-400 text-center w-28">Tanggal</td>
              {days.map(d => (
                <td key={d.day} className={`bg-green-100 text-green-900 font-semibold px-1 py-1 border border-gray-300 text-center ${d.day === todayDay ? 'ring-2 ring-amber-500' : ''}`}>
                  {d.day}
                </td>
              ))}
            </tr>
            <tr>
              <td className="bg-red-200 text-red-900 font-bold px-2 py-1 border border-gray-400 text-center">New Regis</td>
              {days.map(d => (
                <td key={d.day} className={`bg-red-50 text-red-900 px-1 py-1 border border-gray-300 text-center font-medium ${d.day === todayDay ? 'ring-2 ring-amber-500' : ''}`}>
                  {d.new_regis || ''}
                </td>
              ))}
            </tr>
            <tr>
              <td className="bg-blue-200 text-blue-900 font-bold px-2 py-1 border border-gray-400 text-center">New Deposit</td>
              {days.map(d => (
                <td key={d.day} className={`bg-blue-50 text-blue-900 px-1 py-1 border border-gray-300 text-center font-medium ${d.day === todayDay ? 'ring-2 ring-amber-500' : ''}`}>
                  {d.depo_regis || ''}
                </td>
              ))}
            </tr>
            <tr>
              <td className="bg-lime-200 text-lime-900 font-bold px-2 py-1 border border-gray-400 text-center">Persentase</td>
              {days.map(d => {
                const total = (d.new_regis || 0) + (d.depo_regis || 0)
                const p = total > 0 ? ((d.depo_regis / total) * 100).toFixed(1) + '%' : ''
                return (
                  <td key={d.day} className={`bg-lime-50 text-lime-900 px-1 py-1 border border-gray-300 text-center ${d.day === todayDay ? 'ring-2 ring-amber-500' : ''}`}>
                    {p}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bar chart */}
      <div className="p-4 bg-gray-50" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="New Regis" fill="#dc2626" />
            <Bar dataKey="New Deposit" fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function Stat({ label, value, subValue, color }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold ${color} mt-1 tabular-nums`}>
        {value}
        {subValue && <span className="text-sm text-gray-400 ml-2">{subValue}</span>}
      </div>
    </div>
  )
}

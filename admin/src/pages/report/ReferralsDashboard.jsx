import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { referrals as referralsApi, admin, actions } from '../../api/client'

export default function ReferralsDashboard() {
  const today = new Date().toISOString().slice(0, 10)
  const [divisionId, setDivisionId] = useState('')
  const [date, setDate] = useState(today)
  const [brandFilter, setBrandFilter] = useState('')
  const [search, setSearch] = useState('')

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

  // Group items by brand
  const brandGroups = useMemo(() => {
    const map = new Map()
    for (const it of items) {
      if (!map.has(it.brand_key)) {
        map.set(it.brand_key, {
          brand_key: it.brand_key,
          brand_name: it.brand_name,
          brand_color: it.brand_color,
          referrals: [],
        })
      }
      map.get(it.brand_key).referrals.push(it)
    }
    return Array.from(map.values())
  }, [items])

  // Filter by selected brand (client-side)
  const brandFiltered = useMemo(() => {
    if (!brandFilter) return brandGroups
    return brandGroups.filter(g => g.brand_key === brandFilter)
  }, [brandGroups, brandFilter])

  // Filter by search query — match on brand name/key or referral code/keterangan/jenis
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return brandFiltered
    return brandFiltered
      .map(g => {
        const brandHit =
          g.brand_key.toLowerCase().includes(q) ||
          (g.brand_name || '').toLowerCase().includes(q)
        // Kalau brand-level hit → tampilkan semua referral-nya.
        // Kalau tidak, filter referrals yang match di code/display_name/referral_type.
        const refs = brandHit
          ? g.referrals
          : g.referrals.filter(r =>
            (r.referral_code || '').toLowerCase().includes(q) ||
            (r.display_name || '').toLowerCase().includes(q) ||
            (r.referral_type || '').toLowerCase().includes(q)
          )
        return refs.length > 0 ? { ...g, referrals: refs } : null
      })
      .filter(Boolean)
  }, [brandFiltered, search])

  const totalRefsVisible = visibleGroups.reduce((a, g) => a + g.referrals.length, 0)
  const totalRefsAll = brandFiltered.reduce((a, g) => a + g.referrals.length, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Referral Dashboard</h1>
        <button onClick={() => refetch()} className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200">
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Divisi</label>
          <select value={divisionId} onChange={e => { setDivisionId(e.target.value); setBrandFilter(''); setSearch('') }}
            className="border rounded px-3 py-1.5 text-sm min-w-[200px]">
            <option value="">-- pilih divisi --</option>
            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Brand</label>
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm min-w-[200px]"
            disabled={brandGroups.length === 0}>
            <option value="">Semua brand ({brandGroups.length})</option>
            {brandGroups.map(g => (
              <option key={g.brand_key} value={g.brand_key}>
                {g.brand_name} ({g.referrals.length} ref)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Tanggal Referensi</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-600 mb-1">Pencarian</label>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari brand / referral code / keterangan..."
              className="border rounded px-3 py-1.5 text-sm w-full pr-16"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-800"
                title="Clear pencarian"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="text-xs text-gray-500 -mt-2 px-1 flex items-center gap-3 flex-wrap">
        <span>Menampilkan data sepanjang bulan yang memuat tanggal ini.</span>
        {search && (
          <span className="text-blue-700 font-medium">
            Hasil pencarian: {totalRefsVisible} dari {totalRefsAll} referral
          </span>
        )}
      </div>

      {isLoading && <div className="text-gray-500 text-center py-8">Loading...</div>}

      {!isLoading && items.length === 0 && (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          Tidak ada referral aktif untuk divisi ini. Tambahkan di halaman Referrals.
        </div>
      )}

      {!isLoading && items.length > 0 && visibleGroups.length === 0 && (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          Tidak ada hasil untuk pencarian <b>"{search}"</b>.
          <button onClick={() => setSearch('')} className="ml-2 text-blue-600 hover:underline">Reset pencarian</button>
        </div>
      )}

      {visibleGroups.map((group) => (
        <BrandGroup key={group.brand_key} group={group} todayDay={todayDay} divisionId={divisionId} refetch={refetch} />
      ))}
    </div>
  )
}

function BrandGroup({ group, todayDay, divisionId, refetch }) {
  // Brand-level totals across all referrals
  const brandTotals = useMemo(() => {
    let totalNew = 0
    let totalDepo = 0
    const daysCount = group.referrals[0]?.days?.length || 0
    for (const ref of group.referrals) {
      for (const d of ref.days) {
        totalNew += d.new_regis || 0
        totalDepo += d.depo_regis || 0
      }
    }
    const avgNew = daysCount > 0 ? (totalNew / daysCount).toFixed(1) : '0'
    const avgDepo = daysCount > 0 ? (totalDepo / daysCount).toFixed(1) : '0'
    const ratio = (totalNew + totalDepo) > 0
      ? ((totalDepo / (totalNew + totalDepo)) * 100).toFixed(1) + '%'
      : '—'
    return { totalNew, totalDepo, avgNew, avgDepo, ratio }
  }, [group])

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Brand group header */}
      <div className="flex items-center justify-between px-5 py-3 text-white" style={{ background: group.brand_color || '#7c3aed' }}>
        <div className="flex items-center gap-3">
          <div className="text-xl font-black tracking-wide">{group.brand_name}</div>
          <div className="text-xs opacity-80 font-mono">{group.brand_key}</div>
          <div className="text-xs bg-white/20 rounded px-2 py-0.5">{group.referrals.length} referral</div>
        </div>
        <div className="flex gap-5 text-sm">
          <div><span className="opacity-75">New:</span> <b>{brandTotals.totalNew}</b></div>
          <div><span className="opacity-75">Depo:</span> <b>{brandTotals.totalDepo}</b></div>
          <div><span className="opacity-75">Avg/hari:</span> <b>{brandTotals.avgNew} & {brandTotals.avgDepo}</b></div>
          <div><span className="opacity-75">%:</span> <b>{brandTotals.ratio}</b></div>
        </div>
      </div>

      <div className="divide-y">
        {group.referrals.map((ref) => (
          <ReferralRow key={ref.referral_code} item={ref} todayDay={todayDay} divisionId={divisionId} refetch={refetch} />
        ))}
      </div>
    </div>
  )
}

function ReferralRow({ item, todayDay, divisionId, refetch }) {
  const { referral_code, display_name, referral_type, days, year, month } = item
  const typeLabel = referral_type || 'SUNTIK TRAFFIC'
  const [backfilling, setBackfilling] = useState(false)

  // Totals
  const totalNew = days.reduce((a, d) => a + (d.new_regis || 0), 0)
  const totalDepo = days.reduce((a, d) => a + (d.depo_regis || 0), 0)
  const totalRatio = (totalNew + totalDepo) > 0
    ? ((totalDepo / (totalNew + totalDepo)) * 100).toFixed(1) + '%'
    : '—'

  // Detect missing days (before today, have zero data but should have some)
  const missingDays = days.filter(d => d.day < todayDay && d.new_regis === 0 && d.depo_regis === 0).map(d => d.day)

  const handleBackfillMissing = async () => {
    if (missingDays.length === 0) return
    const mm = String(month).padStart(2, '0')
    const firstMissing = `${year}-${mm}-${String(Math.min(...missingDays)).padStart(2, '0')}`
    const lastMissing = `${year}-${mm}-${String(Math.max(...missingDays)).padStart(2, '0')}`
    if (!confirm(`Backfill ${missingDays.length} hari kosong (${firstMissing} s/d ${lastMissing}) untuk referral ini?\n\nTidak kirim ke Telegram, hanya isi data.`)) return
    setBackfilling(true)
    try {
      await actions.referralBackfill(firstMissing, lastMissing, divisionId || null)
      alert(`Backfill dimulai (${firstMissing} s/d ${lastMissing}). Refresh beberapa saat lagi.`)
      setTimeout(() => { refetch?.(); setBackfilling(false) }, 5000)
    } catch (err) {
      alert(`Gagal: ${err.message}`)
      setBackfilling(false)
    }
  }

  // Chart data
  const chartData = days.map(d => ({
    day: d.day,
    'New Regis': d.new_regis || 0,
    'New Deposit': d.depo_regis || 0,
  }))

  return (
    <div>
      {/* Referral sub-header */}
      <div className="flex items-center justify-between px-5 py-2 bg-gray-50 border-b">
        <div className="flex items-center gap-3">
          <span className="bg-gray-900 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider">{typeLabel}</span>
          <span className="bg-green-200 text-green-900 text-xs font-bold font-mono px-2 py-0.5 rounded">ID REFF : {referral_code}</span>
          {display_name && <span className="text-xs text-gray-600">{display_name}</span>}
        </div>
        <div className="flex items-center gap-4 text-xs">
          {missingDays.length > 0 && (
            <button onClick={handleBackfillMissing} disabled={backfilling}
              className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold hover:bg-amber-200 disabled:opacity-50">
              {backfilling ? 'Loading...' : `Backfill ${missingDays.length} hari kosong`}
            </button>
          )}
          <span className="text-red-600 font-bold tabular-nums">New: {totalNew}</span>
          <span className="text-blue-600 font-bold tabular-nums">Depo: {totalDepo}</span>
          <span className="text-green-600 font-bold tabular-nums">{totalRatio}</span>
        </div>
      </div>

      {/* Day-by-day table — full width */}
      <table className="text-[11px] border-collapse w-full" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 110 }} />
          {days.map(d => <col key={d.day} />)}
          <col style={{ width: 65 }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="bg-green-200 text-green-900 font-bold px-2 py-1 border border-gray-400 text-center">Tanggal</td>
            {days.map(d => (
              <td key={d.day} className={`bg-green-100 text-green-900 font-semibold py-1 border border-gray-300 text-center ${d.day === todayDay ? 'ring-2 ring-amber-500 ring-inset' : ''}`}>
                {d.day}
              </td>
            ))}
            <td className="bg-amber-300 text-amber-900 font-bold py-1 border border-gray-400 text-center">TOTAL</td>
          </tr>
          <tr>
            <td className="bg-red-200 text-red-900 font-bold px-2 py-1 border border-gray-400 text-center">New Regis</td>
            {days.map(d => (
              <td key={d.day} className={`bg-red-50 text-red-900 py-1 border border-gray-300 text-center font-medium tabular-nums ${d.day === todayDay ? 'ring-2 ring-amber-500 ring-inset' : ''}`}>
                {d.new_regis || ''}
              </td>
            ))}
            <td className="bg-amber-200 text-amber-900 font-bold py-1 border border-gray-400 text-center tabular-nums">{totalNew}</td>
          </tr>
          <tr>
            <td className="bg-blue-200 text-blue-900 font-bold px-2 py-1 border border-gray-400 text-center">New Deposit</td>
            {days.map(d => (
              <td key={d.day} className={`bg-blue-50 text-blue-900 py-1 border border-gray-300 text-center font-medium tabular-nums ${d.day === todayDay ? 'ring-2 ring-amber-500 ring-inset' : ''}`}>
                {d.depo_regis || ''}
              </td>
            ))}
            <td className="bg-amber-200 text-amber-900 font-bold py-1 border border-gray-400 text-center tabular-nums">{totalDepo}</td>
          </tr>
          <tr>
            <td className="bg-lime-200 text-lime-900 font-bold px-2 py-1 border border-gray-400 text-center">Persentase</td>
            {days.map(d => {
              const total = (d.new_regis || 0) + (d.depo_regis || 0)
              const p = total > 0 ? ((d.depo_regis / total) * 100).toFixed(1) + '%' : ''
              return (
                <td key={d.day} className={`bg-lime-50 text-lime-900 py-1 border border-gray-300 text-center tabular-nums ${d.day === todayDay ? 'ring-2 ring-amber-500 ring-inset' : ''}`}>
                  {p}
                </td>
              )
            })}
            <td className="bg-amber-200 text-amber-900 font-bold py-1 border border-gray-400 text-center tabular-nums">{totalRatio}</td>
          </tr>
        </tbody>
      </table>

      {/* Bar chart */}
      <div className="p-4 bg-gray-50" style={{ height: 280 }}>
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


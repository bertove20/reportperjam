import { useLocation, Link } from 'react-router-dom'

const LABELS = {
  report: 'Report Bot', finance: 'Keuangan', admin: 'Admin', platform: 'Platform',
  brands: 'Brands', hourly: 'Hourly Report', history: 'History', comparison: 'Comparison',
  settings: 'Settings', logs: 'Logs', transactions: 'Transaksi', banks: 'Bank & Wallet',
  balance: 'Saldo', categories: 'Kategori', teams: 'Tim', loans: 'Pinjaman',
  reports: 'Laporan', users: 'Users', divisions: 'Divisions', tenants: 'Tenants', plans: 'Plans',
  new: 'New', edit: 'Edit',
}

export default function Breadcrumb() {
  const location = useLocation()
  const parts = location.pathname.split('/').filter(Boolean)

  if (parts.length <= 1) return null

  const crumbs = parts.map((part, i) => ({
    label: LABELS[part] || part,
    path: '/' + parts.slice(0, i + 1).join('/'),
    isLast: i === parts.length - 1,
  }))

  return (
    <nav className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-3">
      <Link to="/" className="hover:text-gray-600">Home</Link>
      {crumbs.map(c => (
        <span key={c.path} className="flex items-center gap-1.5">
          <span>/</span>
          {c.isLast ? (
            <span className="text-gray-700 font-medium">{c.label}</span>
          ) : (
            <Link to={c.path} className="hover:text-gray-600">{c.label}</Link>
          )}
        </span>
      ))}
    </nav>
  )
}

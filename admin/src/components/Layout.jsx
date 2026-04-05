import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import Breadcrumb from './Breadcrumb'

const SIDEBAR_GROUPS = [
  {
    label: 'REPORT BOT',
    module: 'report',
    color: '#3b82f6',
    bgActive: 'bg-blue-600/20',
    textActive: 'text-blue-400',
    headerBg: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    defaultOpen: true,
    items: [
      { to: '/report', label: 'Dashboard', end: true },
      { to: '/report/brands', label: 'Brands' },
      { to: '/report/hourly', label: 'Hourly Report' },
      { to: '/report/history', label: 'History' },
      { to: '/report/comparison', label: 'Comparison' },
      { to: '/report/referrals', label: 'Referrals' },
      { to: '/admin/divisions', label: 'Divisions', role: 'superadmin' },
      { to: '/report/settings', label: 'Settings', role: 'superadmin' },
      { to: '/report/logs', label: 'Logs' },
    ],
  },
  {
    label: 'KEUANGAN',
    module: 'finance',
    color: '#10b981',
    bgActive: 'bg-emerald-600/20',
    textActive: 'text-emerald-400',
    headerBg: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    defaultOpen: false,
    items: [
      { to: '/finance', label: 'Dashboard', end: true },
      { to: '/finance/transactions', label: 'Transaksi' },
      { to: '/finance/brands', label: 'Brand & Budget' },
      { to: '/finance/banks', label: 'Bank & Wallet' },
      { to: '/finance/balance', label: 'Saldo' },
      { to: '/finance/categories', label: 'Kategori' },
      { to: '/finance/teams', label: 'Tim' },
      { to: '/finance/loans', label: 'Pinjaman' },
      { to: '/finance/reports', label: 'Laporan' },
      { to: '/finance/settings', label: 'Settings', role: 'superadmin' },
      { to: '/admin/users', label: 'Users', role: 'superadmin' },
    ],
  },
  {
    label: 'PLATFORM',
    module: 'platform',
    color: '#ef4444',
    bgActive: 'bg-red-600/20',
    textActive: 'text-red-400',
    headerBg: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    defaultOpen: false,
    platformOnly: true,
    items: [
      { to: '/platform', label: 'Dashboard', end: true },
      { to: '/platform/tenants', label: 'Tenants' },
      { to: '/platform/plans', label: 'Plans' },
    ],
  },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, toggle: toggleDark } = useDarkMode()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    const initial = {}
    SIDEBAR_GROUPS.forEach(g => { initial[g.label] = !g.defaultOpen })
    return initial
  })

  const handleLogout = () => { logout(); navigate('/login') }
  const toggleGroup = (label) => setCollapsed(prev => ({ ...prev, [label]: !prev[label] }))

  const canSeeItem = (item) => {
    if (user?.role === 'superadmin') return true
    if (item.role === 'superadmin') return false
    return true
  }

  const canSeeGroup = (group) => {
    if (group.platformOnly) return !!user?.is_platform_admin
    if (user?.role === 'superadmin') return true
    const perms = user?.permissions || []
    return perms.some(p => p.module === group.module)
  }

  // Current module for breadcrumb
  const path = location.pathname
  const currentModule = path.startsWith('/finance') ? 'Keuangan' :
    path.startsWith('/report') ? 'Report Bot' :
    path.startsWith('/platform') ? 'Platform' :
    path.startsWith('/admin') ? 'Admin' : ''

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-52 bg-gray-950 text-white flex flex-col shrink-0 overflow-y-auto
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold tracking-wide">ECOSYSTEM</h1>
            <p className="text-[10px] text-gray-500 mt-0.5">{user?.full_name || user?.username}</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <nav className="flex-1 py-1.5">
          {/* Home link */}
          <NavLink to="/" end onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => `block px-3 py-2 text-xs mb-1 ${isActive ? 'bg-white/10 text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
            Home
          </NavLink>

          {SIDEBAR_GROUPS.filter(canSeeGroup).map(group => (
            <div key={group.label} className="mb-0.5">
              <button
                onClick={() => toggleGroup(group.label)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-colors ${group.headerBg} border-l-2 ${group.borderColor}`}
                style={{ color: group.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: group.color }} />
                {group.label}
                <span className="ml-auto text-[9px] opacity-60">{collapsed[group.label] ? '+' : '-'}</span>
              </button>

              {!collapsed[group.label] && (
                <div className="py-0.5">
                  {group.items.filter(canSeeItem).map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `block pl-7 pr-3 py-1.5 text-[11px] transition-colors border-l-2 ${
                          isActive
                            ? `${group.bgActive} ${group.textActive} font-semibold ${group.borderColor}`
                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border-transparent'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-2.5 border-t border-gray-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600 uppercase">{user?.role}</span>
            <button onClick={toggleDark} className="text-[10px] text-gray-600 hover:text-white" title="Toggle dark mode">
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
          <button onClick={handleLogout} className="w-full text-left text-[10px] text-gray-600 hover:text-red-400 transition-colors">
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden bg-white border-b px-4 py-2.5 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="text-sm font-semibold text-gray-700">{currentModule}</span>
        </header>

        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          <div className="p-4 lg:p-5">
            <Breadcrumb />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

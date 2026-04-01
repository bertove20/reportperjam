import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

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
      // Admin items masuk di sini
      { to: '/admin/users', label: 'Users', role: 'superadmin' },
      { to: '/admin/divisions', label: 'Divisions', role: 'superadmin' },
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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-52 bg-gray-950 text-white flex flex-col shrink-0 overflow-y-auto">
        {/* Logo */}
        <div className="p-3 border-b border-gray-800">
          <h1 className="text-sm font-bold tracking-wide">ECOSYSTEM</h1>
          <p className="text-[10px] text-gray-500 mt-0.5">{user?.full_name || user?.username}</p>
        </div>

        <nav className="flex-1 py-1.5">
          {SIDEBAR_GROUPS.filter(canSeeGroup).map(group => (
            <div key={group.label} className="mb-0.5">
              {/* Group Header with color accent */}
              <button
                onClick={() => toggleGroup(group.label)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-colors ${group.headerBg} border-l-2 ${group.borderColor}`}
                style={{ color: group.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: group.color }} />
                {group.label}
                <span className="ml-auto text-[9px] opacity-60">{collapsed[group.label] ? '+' : '-'}</span>
              </button>

              {/* Items */}
              {!collapsed[group.label] && (
                <div className="py-0.5">
                  {group.items.filter(canSeeItem).map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
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

        {/* Footer */}
        <div className="p-2.5 border-t border-gray-800 flex items-center justify-between">
          <span className="text-[10px] text-gray-600 uppercase">{user?.role}</span>
          <button onClick={handleLogout} className="text-[10px] text-gray-600 hover:text-red-400 transition-colors">
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-5">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

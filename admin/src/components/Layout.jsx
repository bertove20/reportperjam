import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const SIDEBAR_GROUPS = [
  {
    label: 'REPORT BOT',
    module: 'report',
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
    ],
  },
  {
    label: 'ADMIN',
    module: 'admin',
    role: 'superadmin',
    items: [
      { to: '/admin/users', label: 'Users' },
      { to: '/admin/divisions', label: 'Divisions' },
    ],
  },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState({})

  const handleLogout = () => { logout(); navigate('/login') }

  const toggleGroup = (label) => {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const canSee = (item) => {
    if (!item.role) return true
    return user?.role === item.role || user?.role === 'superadmin'
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-52 bg-gray-900 text-white flex flex-col shrink-0 overflow-y-auto">
        <div className="p-3 border-b border-gray-700">
          <h1 className="text-base font-bold">Ecosystem</h1>
          <p className="text-[10px] text-gray-400 mt-0.5">{user?.role?.toUpperCase()} — {user?.full_name || user?.username}</p>
        </div>

        <nav className="flex-1 py-2">
          {SIDEBAR_GROUPS.filter(canSee).map(group => (
            <div key={group.label} className="mb-1">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider hover:text-gray-300"
              >
                {group.label}
                <span className="text-[9px]">{collapsed[group.label] ? '▸' : '▾'}</span>
              </button>

              {/* Items */}
              {!collapsed[group.label] && (
                <div className="space-y-px">
                  {group.items.filter(canSee).map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `block px-3 py-1.5 text-xs transition-colors ${
                          isActive ? 'bg-gray-700 text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
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

        <div className="p-2 border-t border-gray-700">
          <button onClick={handleLogout} className="w-full text-left text-[11px] text-gray-500 hover:text-white px-2 py-1">
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

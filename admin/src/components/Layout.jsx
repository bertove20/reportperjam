import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/brands', label: 'Brands', icon: '🏷️' },
  { to: '/reports', label: 'Reports', icon: '📋' },
  { to: '/reports/history', label: 'History', icon: '📈' },
  { to: '/reports/comparison', label: 'Comparison', icon: '⚖️' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
  { to: '/logs', label: 'Logs', icon: '📝' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold">Report Bot</h1>
          <p className="text-xs text-gray-400">Admin Panel</p>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                  isActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{user?.username}</span>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-white">
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

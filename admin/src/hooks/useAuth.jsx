import { useState, useEffect, createContext, useContext } from 'react'
import { auth, isAuthenticated, setToken, clearToken } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isAuthenticated()) {
      auth.me().then(setUser).catch(() => clearToken()).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username, password) => {
    const result = await auth.login(username, password)
    setToken(result.token)
    setUser(result.user)
    return result
  }

  const logout = () => { clearToken(); setUser(null) }

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout,
      isAuthenticated: !!user,
      role: user?.role || 'staff',
      isSuperAdmin: user?.role === 'superadmin',
      isPlatformAdmin: !!user?.is_platform_admin,
      canEdit: user?.role !== 'staff',
      tenant: user?.tenant || null,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

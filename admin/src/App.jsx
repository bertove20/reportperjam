import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import BrandList from './pages/BrandList'
import BrandForm from './pages/BrandForm'
import ReportView from './pages/ReportView'
import ReportHistory from './pages/ReportHistory'
import Comparison from './pages/Comparison'
import Settings from './pages/Settings'
import Logs from './pages/Logs'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading...</div>
  if (!isAuthenticated) return <Navigate to="/login" />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="brands" element={<BrandList />} />
          <Route path="brands/new" element={<BrandForm />} />
          <Route path="brands/:key/edit" element={<BrandForm />} />
          <Route path="reports" element={<ReportView />} />
          <Route path="reports/history" element={<ReportHistory />} />
          <Route path="reports/comparison" element={<Comparison />} />
          <Route path="settings" element={<Settings />} />
          <Route path="logs" element={<Logs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

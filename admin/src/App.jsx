import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'

// Lazy load ALL pages — each becomes its own chunk
const Login = lazy(() => import('./pages/Login'))

// Report Module
const ReportDashboard = lazy(() => import('./pages/report/Dashboard'))
const ReportBrandList = lazy(() => import('./pages/report/BrandList'))
const ReportBrandForm = lazy(() => import('./pages/report/BrandForm'))
const ReportView = lazy(() => import('./pages/report/ReportView'))
const ReportHistory = lazy(() => import('./pages/report/ReportHistory'))
const ReportComparison = lazy(() => import('./pages/report/Comparison'))
const ReportSettings = lazy(() => import('./pages/report/Settings'))
const ReportLogs = lazy(() => import('./pages/report/Logs'))
const ReportReferrals = lazy(() => import('./pages/report/Referrals'))
const ReportReferralsDashboard = lazy(() => import('./pages/report/ReferralsDashboard'))
const ReportReferralLogs = lazy(() => import('./pages/report/ReferralLogs'))

// Finance Module
const FinanceDashboard = lazy(() => import('./pages/finance/Dashboard'))
const FinanceTransactions = lazy(() => import('./pages/finance/Transactions'))
const FinanceBrands = lazy(() => import('./pages/finance/Brands'))
const FinanceBanks = lazy(() => import('./pages/finance/Banks'))
const FinanceBalance = lazy(() => import('./pages/finance/Balance'))
const FinanceCategories = lazy(() => import('./pages/finance/Categories'))
const FinanceTeams = lazy(() => import('./pages/finance/Teams'))
const FinanceLoans = lazy(() => import('./pages/finance/Loans'))
const FinanceReports = lazy(() => import('./pages/finance/Reports'))
const FinanceSettings = lazy(() => import('./pages/finance/Settings'))

// Admin Module
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const AdminDivisions = lazy(() => import('./pages/admin/Divisions'))

const Signup = lazy(() => import('./pages/Signup'))

// Home
const Home = lazy(() => import('./pages/Home'))

const Loader = () => <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading...</div>

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading...</div>
  if (!isAuthenticated) return <Navigate to="/login" />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            {/* Home: Combined Dashboard */}
            <Route index element={<Home />} />

            {/* Legacy redirects (URL lama → baru) */}
            <Route path="brands" element={<Navigate to="/report/brands" />} />
            <Route path="brands/new" element={<Navigate to="/report/brands/new" />} />
            <Route path="brands/:key/edit" element={<Navigate to="/report/brands" />} />
            <Route path="reports" element={<Navigate to="/report/hourly" />} />
            <Route path="reports/history" element={<Navigate to="/report/history" />} />
            <Route path="reports/comparison" element={<Navigate to="/report/comparison" />} />
            <Route path="settings" element={<Navigate to="/report/settings" />} />
            <Route path="logs" element={<Navigate to="/report/logs" />} />

            {/* Report Bot */}
            <Route path="report">
              <Route index element={<ReportDashboard />} />
              <Route path="brands" element={<ReportBrandList />} />
              <Route path="brands/new" element={<ReportBrandForm />} />
              <Route path="brands/:key/edit" element={<ReportBrandForm />} />
              <Route path="hourly" element={<ReportView />} />
              <Route path="history" element={<ReportHistory />} />
              <Route path="comparison" element={<ReportComparison />} />
              <Route path="settings" element={<ReportSettings />} />
              <Route path="logs" element={<ReportLogs />} />
              <Route path="referrals" element={<ReportReferrals />} />
              <Route path="referrals-dashboard" element={<ReportReferralsDashboard />} />
              <Route path="referral-logs" element={<ReportReferralLogs />} />
            </Route>

            {/* Finance */}
            <Route path="finance">
              <Route index element={<FinanceDashboard />} />
              <Route path="transactions" element={<FinanceTransactions />} />
              <Route path="brands" element={<FinanceBrands />} />
              <Route path="banks" element={<FinanceBanks />} />
              <Route path="balance" element={<FinanceBalance />} />
              <Route path="categories" element={<FinanceCategories />} />
              <Route path="teams" element={<FinanceTeams />} />
              <Route path="loans" element={<FinanceLoans />} />
              <Route path="reports" element={<FinanceReports />} />
              <Route path="settings" element={<FinanceSettings />} />
            </Route>

            {/* Admin */}
            <Route path="admin">
              <Route path="users" element={<AdminUsers />} />
              <Route path="divisions" element={<AdminDivisions />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

import { useState } from 'react'
import { signup, setToken } from '../api/client'

export default function Signup() {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await signup(form)
      setResult(res)
      if (res.token) setToken(res.token)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (result?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-sm text-center">
          <div className="text-3xl mb-3">🎉</div>
          <h1 className="text-xl font-bold mb-2">Tenant Created!</h1>
          <p className="text-sm text-gray-600 mb-4">{result.tenant?.name}</p>
          <a href={result.loginUrl || '/'} className="bg-blue-600 text-white px-6 py-2 rounded text-sm inline-block hover:bg-blue-700">
            Go to Dashboard
          </a>
          <p className="text-xs text-gray-400 mt-3">URL: {result.loginUrl}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2">Register</h1>
        <p className="text-gray-500 text-center mb-6 text-sm">Create your ecosystem account</p>

        {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input type="text" value={form.company_name || ''} onChange={setF('company_name')}
              className="w-full border rounded px-3 py-2 text-sm" required placeholder="My Company" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Username</label>
            <input type="text" value={form.username || ''} onChange={setF('username')}
              className="w-full border rounded px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input type="text" value={form.full_name || ''} onChange={setF('full_name')}
              className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={form.password || ''} onChange={setF('password')}
              className="w-full border rounded px-3 py-2 text-sm" required minLength={4} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-gray-900 text-white py-2 rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Account'}
          </button>
          <p className="text-xs text-center text-gray-400">
            Already have an account? <a href="/login" className="text-blue-600">Login</a>
          </p>
        </form>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { brands as brandsApi } from '../../api/client'

const ENGINES = [
  { value: 'asia77', label: 'Asia77 (Cookie-based)' },
  { value: 'syntech', label: 'Syntech (JWT-based)' },
]

const DEFAULT_COLORS = ['#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#2563eb', '#db2777', '#475569']

export default function BrandForm() {
  const { key } = useParams()
  const isEdit = !!key
  const navigate = useNavigate()

  const [form, setForm] = useState({
    key: '', name: '', engine: 'asia77', domain: '',
    is_active: 1, sort_order: 0,
    user_id: 0, cookie_header: '',
    auth_user: '', auth_pass: '', auth_pin: '',
    primary_color: '#7c3aed', logo_base64: '',
  })
  const [error, setError] = useState('')

  const { data: existing } = useQuery({
    queryKey: ['brand', key],
    queryFn: () => brandsApi.get(key),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing) {
      setForm({
        key: existing.key || '',
        name: existing.name || '',
        engine: existing.engine || 'asia77',
        domain: existing.domain || '',
        is_active: existing.is_active ?? 1,
        sort_order: existing.sort_order || 0,
        user_id: existing.user_id || 0,
        cookie_header: existing.cookie_header || '',
        auth_user: existing.auth_user || '',
        auth_pass: existing.auth_pass || '',
        auth_pin: existing.auth_pin || '',
        primary_color: existing.primary_color || '#7c3aed',
        logo_base64: existing.logo_base64 || '',
      })
    }
  }, [existing])

  const saveMutation = useMutation({
    mutationFn: (data) => isEdit ? brandsApi.update(key, data) : brandsApi.create(data),
    onSuccess: () => navigate('/brands'),
    onError: (err) => setError(err.message),
  })

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })
  const setNum = (field) => (e) => setForm({ ...form, [field]: parseInt(e.target.value) || 0 })

  const handleLogoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm({ ...form, logo_base64: reader.result })
    reader.readAsDataURL(file)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    saveMutation.mutate(form)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isEdit ? `Edit Brand: ${key}` : 'Add New Brand'}
      </h1>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-gray-900">Basic Info</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Key</label>
              <input value={form.key} onChange={set('key')} disabled={isEdit}
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100" required placeholder="BRAND_X" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input value={form.name} onChange={set('name')}
                className="w-full border rounded px-3 py-2 text-sm" required placeholder="Brand Name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Engine</label>
              <select value={form.engine} onChange={set('engine')}
                className="w-full border rounded px-3 py-2 text-sm">
                {ENGINES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
              <input value={form.domain} onChange={set('domain')}
                className="w-full border rounded px-3 py-2 text-sm" required placeholder="panel.example.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.is_active} onChange={setNum('is_active')}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value={1}>Active</option>
                <option value={0}>Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
              <input type="number" value={form.sort_order} onChange={setNum('sort_order')}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        {/* Engine-specific fields */}
        {form.engine === 'asia77' && (
          <div className="bg-white rounded-lg border p-4 space-y-4">
            <h2 className="font-semibold text-gray-900">Asia77 Settings</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User ID (IDUS)</label>
              <input type="number" value={form.user_id} onChange={setNum('user_id')}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="12345" />
              <p className="text-xs text-gray-400 mt-1">View Page Source di panel, cari "var idus = ..."</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cookie Header</label>
              <textarea value={form.cookie_header} onChange={set('cookie_header')} rows={3}
                className="w-full border rounded px-3 py-2 text-sm font-mono"
                placeholder="SESSION=xxx; cf_clearance=yyy" />
              <p className="text-xs text-gray-400 mt-1">Copy dari DevTools &gt; Network &gt; Headers &gt; Cookie</p>
            </div>
          </div>
        )}

        {form.engine === 'syntech' && (
          <div className="bg-white rounded-lg border p-4 space-y-4">
            <h2 className="font-semibold text-gray-900">Syntech Settings</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input value={form.auth_user} onChange={set('auth_user')}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={form.auth_pass} onChange={set('auth_pass')}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
              <input value={form.auth_pin} onChange={set('auth_pin')}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
        )}

        {/* Visual */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-gray-900">Visual</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={form.primary_color} onChange={set('primary_color')}
                className="w-10 h-10 rounded cursor-pointer border-0" />
              <input value={form.primary_color} onChange={set('primary_color')}
                className="border rounded px-3 py-2 text-sm w-28 font-mono" />
              <div className="flex gap-1">
                {DEFAULT_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, primary_color: c })}
                    className="w-6 h-6 rounded border" style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo (PNG)</label>
            <input type="file" accept="image/png" onChange={handleLogoUpload}
              className="text-sm" />
            {form.logo_base64 && (
              <img src={form.logo_base64} alt="Logo" className="mt-2 h-12 object-contain" />
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <button type="submit" disabled={saveMutation.isPending}
            className="bg-blue-600 text-white px-6 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saveMutation.isPending ? 'Saving...' : isEdit ? 'Update Brand' : 'Create Brand'}
          </button>
          <button type="button" onClick={() => navigate('/brands')}
            className="bg-gray-200 text-gray-700 px-6 py-2 rounded text-sm hover:bg-gray-300">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { admin } from '../../api/client'
import CrudTable, { FormModal, Input, Select } from '../../components/CrudTable'

const MODULES = [
  {
    key: 'report', label: 'Report Bot', color: '#3b82f6',
    features: ['Dashboard', 'Brands', 'Hourly Report', 'History', 'Comparison', 'Settings', 'Logs'],
  },
  {
    key: 'finance', label: 'Keuangan', color: '#10b981',
    features: ['Dashboard', 'Transaksi', 'Brand & Budget', 'Bank & Wallet', 'Saldo', 'Kategori', 'Tim', 'Pinjaman', 'Laporan', 'Settings', 'Users', 'Divisions'],
  },
]

const ROLES = [
  { value: 'superadmin', label: 'Super Admin — Akses semua' },
  { value: 'leader', label: 'Tim Leader — Manage per divisi' },
  { value: 'staff', label: 'Staff — View only' },
]

export default function Users() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [permissions, setPermissions] = useState([])

  const { data = [] } = useQuery({ queryKey: ['admin-users'], queryFn: admin.users.list })
  const { data: divData = [] } = useQuery({ queryKey: ['admin-divisions'], queryFn: admin.divisions.list })

  const createMut = useMutation({
    mutationFn: (d) => admin.users.create({ ...d, permissions }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setModal(false) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => admin.users.update(id, { ...d, permissions }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setModal(false) },
  })
  const deleteMut = useMutation({
    mutationFn: (id) => admin.users.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const openAdd = () => {
    setEditing(null)
    setForm({})
    setPermissions(MODULES.map(m => ({ module: m.key, can_edit: 0, enabled: false, features: {} })))
    setModal(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({ username: r.username, full_name: r.full_name, role: r.role, division_id: r.division_id, is_active: r.is_active })
    // Load existing permissions
    const perms = r.permissions || []
    setPermissions(MODULES.map(m => {
      const existing = perms.find(p => p.module === m.key)
      return {
        module: m.key,
        can_edit: existing?.can_edit || 0,
        enabled: !!existing,
        features: {},
      }
    }))
    setModal(true)
  }

  const toggleModule = (moduleKey) => {
    setPermissions(prev => prev.map(p =>
      p.module === moduleKey ? { ...p, enabled: !p.enabled } : p
    ))
  }

  const toggleEdit = (moduleKey) => {
    setPermissions(prev => prev.map(p =>
      p.module === moduleKey ? { ...p, can_edit: p.can_edit ? 0 : 1 } : p
    ))
  }

  const divisions = Array.isArray(divData) ? divData : (divData.divisions || [])
  const users = Array.isArray(data) ? data : (data.users || [])
  const isSuperAdmin = form.role === 'superadmin'

  const columns = [
    { key: 'username', label: 'Username' },
    { key: 'full_name', label: 'Nama' },
    {
      key: 'role', label: 'Role',
      render: r => {
        const colors = { superadmin: 'bg-red-50 text-red-700', leader: 'bg-blue-50 text-blue-700', staff: 'bg-gray-100 text-gray-600' }
        return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[r.role] || 'bg-gray-100'}`}>{r.role}</span>
      }
    },
    { key: 'division_name', label: 'Divisi' },
    {
      key: 'is_active', label: 'Status',
      render: r => r.is_active ? <span className="text-green-600 text-xs">Active</span> : <span className="text-red-400 text-xs">Inactive</span>
    },
  ]

  return (
    <div>
      <CrudTable title="User Management" columns={columns} rows={users}
        onAdd={openAdd} onEdit={openEdit}
        onDelete={(r) => deleteMut.mutate(r.id)} />

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit User' : 'Tambah User'}</h2>

            <form onSubmit={e => { e.preventDefault(); editing ? updateMut.mutate({ id: editing.id, ...form }) : createMut.mutate(form) }} className="space-y-3">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Username" value={form.username || ''} onChange={setF('username')} required />
                <Input label="Nama Lengkap" value={form.full_name || ''} onChange={setF('full_name')} />
              </div>

              {!editing && <Input label="Password" type="password" value={form.password || ''} onChange={setF('password')} required />}
              {editing && <Input label="Password Baru (kosongkan jika tidak diubah)" type="password" value={form.password || ''} onChange={setF('password')} />}

              <div className="grid grid-cols-2 gap-3">
                <Select label="Role" value={form.role || ''} onChange={setF('role')} options={ROLES} />
                <Select label="Divisi" value={form.division_id || ''} onChange={setF('division_id')}
                  options={divisions.map(d => ({ value: d.id, label: d.name }))} />
              </div>

              <Select label="Status" value={form.is_active ?? '1'} onChange={setF('is_active')}
                options={[{ value: '1', label: 'Active' }, { value: '0', label: 'Inactive' }]} />

              {/* Permission Matrix */}
              {!isSuperAdmin && (
                <div className="border rounded-lg p-3 mt-2">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">Akses Module & Fitur</h3>
                  <p className="text-[10px] text-gray-400 mb-3">Super Admin otomatis dapat semua akses. Untuk role lain, aktifkan module yang boleh diakses.</p>

                  {MODULES.map(mod => {
                    const perm = permissions.find(p => p.module === mod.key)
                    const isEnabled = perm?.enabled

                    return (
                      <div key={mod.key} className="mb-3 border rounded-lg overflow-hidden">
                        {/* Module header */}
                        <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: mod.color + '10' }}>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isEnabled || false}
                              onChange={() => toggleModule(mod.key)}
                              className="rounded"
                            />
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: mod.color }} />
                            <span className="text-sm font-semibold" style={{ color: mod.color }}>{mod.label}</span>
                          </label>

                          {isEnabled && (
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={perm?.can_edit === 1}
                                onChange={() => toggleEdit(mod.key)}
                                className="rounded"
                              />
                              <span className="text-[10px] text-gray-500">Bisa Edit/Create/Delete</span>
                            </label>
                          )}
                        </div>

                        {/* Features list */}
                        {isEnabled && (
                          <div className="px-3 py-2 grid grid-cols-3 gap-1">
                            {mod.features.map(feat => (
                              <div key={feat} className="flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-gray-300" />
                                <span className="text-[10px] text-gray-500">{feat}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {isSuperAdmin && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-600">
                  Super Admin otomatis mendapat akses ke <strong>semua module dan fitur</strong>. Tidak perlu set permission.
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={createMut.isPending || updateMut.isPending}
                  className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                  {createMut.isPending || updateMut.isPending ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => setModal(false)}
                  className="bg-gray-100 px-4 py-1.5 rounded text-sm hover:bg-gray-200">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

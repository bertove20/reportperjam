import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { admin } from '../../api/client'
import CrudTable, { FormModal, Input, Select } from '../../components/CrudTable'

export default function Users() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})

  const { data = [] } = useQuery({ queryKey: ['admin-users'], queryFn: admin.users.list })
  const { data: divData = [] } = useQuery({ queryKey: ['admin-divisions'], queryFn: admin.divisions.list })
  const createMut = useMutation({ mutationFn: (d) => admin.users.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setModal(false) } })
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => admin.users.update(id, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setModal(false) } })
  const deleteMut = useMutation({ mutationFn: (id) => admin.users.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }) })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const openAdd = () => { setEditing(null); setForm({}); setModal(true) }
  const openEdit = (r) => { setEditing(r); setForm({ username: r.username, full_name: r.full_name, role: r.role, division_id: r.division_id, is_active: r.is_active }); setModal(true) }

  const divisions = divData.divisions || divData || []
  const users = data.users || data || []
  const roles = [{ value: 'superadmin', label: 'Super Admin' }, { value: 'admin', label: 'Admin' }, { value: 'viewer', label: 'Viewer' }]

  const columns = [
    { key: 'username', label: 'Username' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'role', label: 'Role', render: r => <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">{r.role}</span> },
    { key: 'division_name', label: 'Division' },
    { key: 'is_active', label: 'Active', render: r => r.is_active ? <span className="text-green-600">Yes</span> : <span className="text-red-500">No</span> },
  ]

  return (
    <div>
      <CrudTable title="Users" columns={columns} rows={users}
        onAdd={openAdd} onEdit={openEdit}
        onDelete={(r) => deleteMut.mutate(r.id)} />

      {modal && (
        <FormModal title={editing ? 'Edit User' : 'Add User'} onClose={() => setModal(false)}
          onSubmit={() => editing ? updateMut.mutate({ id: editing.id, ...form }) : createMut.mutate(form)}
          loading={createMut.isPending || updateMut.isPending}>
          <Input label="Username" value={form.username || ''} onChange={setF('username')} required />
          <Input label="Full Name" value={form.full_name || ''} onChange={setF('full_name')} required />
          {!editing && <Input label="Password" type="password" value={form.password || ''} onChange={setF('password')} required />}
          <Select label="Role" value={form.role || ''} onChange={setF('role')} options={roles} />
          <Select label="Division" value={form.division_id || ''} onChange={setF('division_id')}
            options={divisions.map(d => ({ value: d.id, label: d.name }))} />
          <Select label="Active" value={form.is_active ?? '1'} onChange={setF('is_active')}
            options={[{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }]} />
        </FormModal>
      )}
    </div>
  )
}

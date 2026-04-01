import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { platform } from '../../api/client'
import CrudTable, { FormModal, Input, Select } from '../../components/CrudTable'

export default function Tenants() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})

  const { data = [] } = useQuery({ queryKey: ['platform-tenants'], queryFn: platform.tenants.list })
  const { data: plans = [] } = useQuery({ queryKey: ['platform-plans'], queryFn: platform.plans.list })
  const createMut = useMutation({ mutationFn: platform.tenants.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-tenants'] }); setModal(false) } })
  const deleteMut = useMutation({ mutationFn: (id) => platform.tenants.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-tenants'] }) })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const tenants = Array.isArray(data) ? data : []

  const columns = [
    { key: 'name', label: 'Company' },
    { key: 'slug', label: 'Slug', render: r => <code className="text-xs bg-gray-100 px-1 rounded">{r.slug}</code> },
    { key: 'plan_name', label: 'Plan', render: r => <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700">{r.plan_name}</span> },
    { key: 'user_count', label: 'Users', align: 'right' },
    { key: 'report_brand_count', label: 'Report', align: 'right' },
    { key: 'is_active', label: 'Status', render: r => r.is_active ? <span className="text-green-600 text-xs">Active</span> : <span className="text-red-400 text-xs">Inactive</span> },
  ]

  return (
    <div>
      <CrudTable title="Tenants" columns={columns} rows={tenants}
        onAdd={() => { setForm({}); setModal(true) }}
        onDelete={r => deleteMut.mutate(r.id)}
        addLabel="+ New Tenant" />

      {modal && (
        <FormModal title="Create Tenant" onClose={() => setModal(false)}
          onSubmit={() => createMut.mutate(form)} loading={createMut.isPending}>
          <Input label="Company Name" value={form.name || ''} onChange={setF('name')} required />
          <Input label="Slug (URL)" value={form.slug || ''} onChange={setF('slug')} placeholder="my-company" required />
          <Select label="Plan" value={form.plan_id || ''} onChange={setF('plan_id')}
            options={plans.map(p => ({ value: p.id, label: `${p.name} (${p.max_brands} brands, ${p.max_users} users)` }))} />
          <hr className="my-2" />
          <Input label="Admin Username" value={form.admin_username || ''} onChange={setF('admin_username')} required />
          <Input label="Admin Password" type="password" value={form.admin_password || ''} onChange={setF('admin_password')} required />
        </FormModal>
      )}
    </div>
  )
}

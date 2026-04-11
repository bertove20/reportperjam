import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { admin } from '../../api/client'
import CrudTable, { FormModal, Input, Select } from '../../components/CrudTable'

export default function Divisions() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})

  const { data = [] } = useQuery({ queryKey: ['admin-divisions'], queryFn: () => admin.divisions.list() })
  const createMut = useMutation({ mutationFn: (d) => admin.divisions.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-divisions'] }); setModal(false) } })
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => admin.divisions.update(id, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-divisions'] }); setModal(false) } })
  const deleteMut = useMutation({ mutationFn: (id) => admin.divisions.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-divisions'] }) })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const openAdd = () => { setEditing(null); setForm({}); setModal(true) }
  const openEdit = (r) => { setEditing(r); setForm({ name: r.name, description: r.description, tg_group_id: r.tg_group_id, is_active: r.is_active }); setModal(true) }

  const renderGroups = (raw) => {
    if (!raw) return <span className="text-gray-400">—</span>
    const parts = String(raw).split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
    if (parts.length === 0) return <span className="text-gray-400">—</span>
    return (
      <div className="flex flex-wrap gap-1">
        {parts.map((id, i) => (
          <span key={i} className="font-mono text-[11px] bg-gray-100 text-gray-700 rounded px-1.5 py-0.5">{id}</span>
        ))}
      </div>
    )
  }

  const columns = [
    { key: 'name', label: 'Division Name' },
    { key: 'description', label: 'Description' },
    { key: 'tg_group_id', label: 'Telegram Group(s)', render: r => renderGroups(r.tg_group_id) },
    { key: 'is_active', label: 'Active', render: r => r.is_active ? <span className="text-green-600">Yes</span> : <span className="text-red-500">No</span> },
  ]

  return (
    <div>
      <CrudTable title="Divisions" columns={columns} rows={data.divisions || data || []}
        onAdd={openAdd} onEdit={openEdit}
        onDelete={(r) => deleteMut.mutate(r.id)} />

      {modal && (
        <FormModal title={editing ? 'Edit Division' : 'Add Division'} onClose={() => setModal(false)}
          onSubmit={() => editing ? updateMut.mutate({ id: editing.id, ...form }) : createMut.mutate(form)}
          loading={createMut.isPending || updateMut.isPending}>
          <Input label="Name" value={form.name || ''} onChange={setF('name')} required />
          <Input label="Description" value={form.description || ''} onChange={setF('description')} />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Telegram Group ID(s)</label>
            <textarea
              value={form.tg_group_id || ''}
              onChange={setF('tg_group_id')}
              rows={3}
              placeholder={'-1001234567890\n-1009876543210'}
              className="w-full border rounded px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Bisa lebih dari satu — pisahkan dengan baris baru atau koma. Report akan dikirim ke semua group yang terdaftar.
            </p>
          </div>
          <Select label="Active" value={form.is_active ?? '1'} onChange={setF('is_active')}
            options={[{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }]} />
        </FormModal>
      )}
    </div>
  )
}

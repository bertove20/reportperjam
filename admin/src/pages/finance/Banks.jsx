import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { finance } from '../../api/client'
import CrudTable, { FormModal, Input, Select } from '../../components/CrudTable'

export default function Banks() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})

  const { data = [] } = useQuery({ queryKey: ['fin-banks'], queryFn: finance.banks.list })
  const createMut = useMutation({ mutationFn: (d) => finance.banks.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-banks'] }); setModal(false) } })
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => finance.banks.update(id, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-banks'] }); setModal(false) } })
  const deleteMut = useMutation({ mutationFn: (id) => finance.banks.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-banks'] }) })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const openAdd = () => { setEditing(null); setForm({}); setModal(true) }
  const openEdit = (r) => { setEditing(r); setForm({ name: r.name, currency: r.currency, division: r.division }); setModal(true) }

  const columns = [
    { key: 'name', label: 'Bank Name' },
    { key: 'currency', label: 'Currency' },
    { key: 'wallet_count', label: 'Wallets', align: 'right' },
    { key: 'division_name', label: 'Division' },
  ]

  return (
    <div>
      <CrudTable title="Banks" columns={columns} rows={data.banks || data || []}
        onAdd={openAdd} onEdit={openEdit}
        onDelete={(r) => deleteMut.mutate(r.id)} />

      {modal && (
        <FormModal title={editing ? 'Edit Bank' : 'Add Bank'} onClose={() => setModal(false)}
          onSubmit={() => editing ? updateMut.mutate({ id: editing.id, ...form }) : createMut.mutate(form)}
          loading={createMut.isPending || updateMut.isPending}>
          <Input label="Name" value={form.name || ''} onChange={setF('name')} required />
          <Select label="Currency" value={form.currency || ''} onChange={setF('currency')}
            options={[{ value: 'USD', label: 'USD' }, { value: 'IDR', label: 'IDR' }]} />
          <Input label="Division" value={form.division || ''} onChange={setF('division')} />
        </FormModal>
      )}
    </div>
  )
}

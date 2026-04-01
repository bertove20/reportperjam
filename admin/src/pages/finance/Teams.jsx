import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { finance } from '../../api/client'
import CrudTable, { FormModal, Input } from '../../components/CrudTable'

export default function Teams() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})

  const { data = [] } = useQuery({ queryKey: ['fin-teams'], queryFn: finance.teams.list })
  const createMut = useMutation({ mutationFn: (d) => finance.teams.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-teams'] }); setModal(false) } })
  const deleteMut = useMutation({ mutationFn: (id) => finance.teams.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-teams'] }) })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const columns = [
    { key: 'name', label: 'Team Name' },
    { key: 'division_name', label: 'Division' },
    { key: 'tx_count', label: 'Transactions', align: 'right' },
    { key: 'category_count', label: 'Categories', align: 'right' },
  ]

  return (
    <div>
      <CrudTable title="Teams" columns={columns} rows={data.teams || data || []}
        onAdd={() => { setForm({}); setModal(true) }}
        onDelete={(r) => deleteMut.mutate(r.id)} />

      {modal && (
        <FormModal title="Add Team" onClose={() => setModal(false)} onSubmit={() => createMut.mutate(form)} loading={createMut.isPending}>
          <Input label="Name" value={form.name || ''} onChange={setF('name')} required />
          <Input label="Division" value={form.division || ''} onChange={setF('division')} />
        </FormModal>
      )}
    </div>
  )
}

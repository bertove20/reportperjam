import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { finance } from '../../api/client'
import CrudTable, { FormModal, Input, Select } from '../../components/CrudTable'

export default function Categories() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})

  const { data = [] } = useQuery({ queryKey: ['fin-categories'], queryFn: finance.categories.list })
  const { data: teams = [] } = useQuery({ queryKey: ['fin-teams'], queryFn: finance.teams.list })
  const createMut = useMutation({ mutationFn: (d) => finance.categories.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-categories'] }); setModal(false) } })
  const deleteMut = useMutation({ mutationFn: (id) => finance.categories.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-categories'] }) })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const teamList = teams.teams || teams || []

  const columns = [
    { key: 'name', label: 'Category' },
    { key: 'team_name', label: 'Team' },
    { key: 'tx_count', label: 'Transactions', align: 'right' },
  ]

  return (
    <div>
      <CrudTable title="Categories" columns={columns} rows={data.categories || data || []}
        onAdd={() => { setForm({}); setModal(true) }}
        onDelete={(r) => deleteMut.mutate(r.id)} />

      {modal && (
        <FormModal title="Add Category" onClose={() => setModal(false)} onSubmit={() => createMut.mutate(form)} loading={createMut.isPending}>
          <Input label="Name" value={form.name || ''} onChange={setF('name')} required />
          <Select label="Team" value={form.team_id || ''} onChange={setF('team_id')}
            options={teamList.map(t => ({ value: t.id, label: t.name }))} />
        </FormModal>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { finance } from '../../api/client'
import CrudTable, { FormModal, Input, Select } from '../../components/CrudTable'

const fmt = (n) => parseFloat(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })

export default function Brands() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null) // 'add' | 'budget'
  const [form, setForm] = useState({})
  const [budgetTarget, setBudgetTarget] = useState(null)

  const { data = [] } = useQuery({ queryKey: ['fin-brands'], queryFn: finance.brands.list })
  const createMut = useMutation({ mutationFn: (d) => finance.brands.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-brands'] }); setModal(null) } })
  const deleteMut = useMutation({ mutationFn: (id) => finance.brands.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-brands'] }) })
  const budgetMut = useMutation({ mutationFn: ({ id, ...d }) => finance.brands.setBudget(id, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-brands'] }); setModal(null) } })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'division_name', label: 'Division' },
    { key: 'budget', label: 'Budget', align: 'right', render: r => `$${fmt(r.budget_usd)}` },
    { key: 'tx_count', label: 'Transactions', align: 'right' },
    { key: 'actions', label: '', render: r => (
      <button onClick={() => { setBudgetTarget(r); setForm({ budget_usd: r.budget_usd || '', budget_idr: r.budget_idr || '' }); setModal('budget') }}
        className="text-xs text-blue-600 hover:underline">Budget</button>
    )},
  ]

  return (
    <div>
      <CrudTable title="Finance Brands" columns={columns} rows={data.brands || data || []}
        onAdd={() => { setForm({}); setModal('add') }}
        onDelete={(r) => deleteMut.mutate(r.id)} />

      {modal === 'add' && (
        <FormModal title="Add Brand" onClose={() => setModal(null)} onSubmit={() => createMut.mutate(form)} loading={createMut.isPending}>
          <Input label="Name" value={form.name || ''} onChange={setF('name')} required />
          <Input label="Division" value={form.division || ''} onChange={setF('division')} />
        </FormModal>
      )}

      {modal === 'budget' && budgetTarget && (
        <FormModal title={`Budget — ${budgetTarget.name}`} onClose={() => setModal(null)}
          onSubmit={() => budgetMut.mutate({ id: budgetTarget.id, ...form })} loading={budgetMut.isPending}>
          <Input label="Budget USD" type="number" step="0.01" value={form.budget_usd || ''} onChange={setF('budget_usd')} />
          <Input label="Budget IDR" type="number" value={form.budget_idr || ''} onChange={setF('budget_idr')} />
        </FormModal>
      )}
    </div>
  )
}

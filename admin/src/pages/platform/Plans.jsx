import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { platform } from '../../api/client'
import CrudTable, { FormModal, Input } from '../../components/CrudTable'

export default function Plans() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})

  const { data = [] } = useQuery({ queryKey: ['platform-plans'], queryFn: platform.plans.list })
  const createMut = useMutation({ mutationFn: platform.plans.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-plans'] }); setModal(false) } })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const plans = Array.isArray(data) ? data : []

  const columns = [
    { key: 'name', label: 'Plan' },
    { key: 'max_brands', label: 'Max Brands', align: 'right' },
    { key: 'max_users', label: 'Max Users', align: 'right' },
    { key: 'max_report_brands', label: 'Max Report Brands', align: 'right' },
    { key: 'price_monthly', label: 'Price/mo', align: 'right', render: r => `$${r.price_monthly}` },
  ]

  return (
    <div>
      <CrudTable title="Plans" columns={columns} rows={plans}
        onAdd={() => { setForm({}); setModal(true) }} addLabel="+ New Plan" />

      {modal && (
        <FormModal title="Create Plan" onClose={() => setModal(false)}
          onSubmit={() => createMut.mutate(form)} loading={createMut.isPending}>
          <Input label="Plan Name" value={form.name || ''} onChange={setF('name')} required />
          <Input label="Max Brands" type="number" value={form.max_brands || '5'} onChange={setF('max_brands')} />
          <Input label="Max Users" type="number" value={form.max_users || '10'} onChange={setF('max_users')} />
          <Input label="Max Report Brands" type="number" value={form.max_report_brands || '5'} onChange={setF('max_report_brands')} />
          <Input label="Price/month ($)" type="number" step="0.01" value={form.price_monthly || '0'} onChange={setF('price_monthly')} />
        </FormModal>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { finance } from '../../api/client'
import CrudTable, { FormModal, Input } from '../../components/CrudTable'

const fmt = (n) => parseFloat(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })
const badge = (s) => {
  const colors = { active: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700' }
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[s] || 'bg-gray-100 text-gray-600'}`}>{s}</span>
}

export default function Loans() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null) // 'add' | 'repay'
  const [form, setForm] = useState({})
  const [repayTarget, setRepayTarget] = useState(null)

  const { data } = useQuery({ queryKey: ['fin-loans'], queryFn: finance.loans.list })
  const createMut = useMutation({ mutationFn: (d) => finance.loans.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-loans'] }); setModal(null) } })
  const repayMut = useMutation({ mutationFn: ({ id, ...d }) => finance.loans.repay(id, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-loans'] }); setModal(null) } })
  const deleteMut = useMutation({ mutationFn: (id) => finance.loans.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-loans'] }) })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const loans = data?.loans || data || []
  const summary = data?.summary

  const columns = [
    { key: 'borrower', label: 'Borrower' },
    { key: 'amount', label: 'Amount', align: 'right', render: r => `$${fmt(r.amount)}` },
    { key: 'remaining', label: 'Remaining', align: 'right', render: r => `$${fmt(r.remaining)}` },
    { key: 'status', label: 'Status', render: r => badge(r.status) },
    { key: 'due_date', label: 'Due', render: r => r.due_date?.slice(0, 10) },
    { key: '_repay', label: '', render: r => r.status === 'active' && (
      <button onClick={() => { setRepayTarget(r); setForm({ amount: '' }); setModal('repay') }}
        className="text-xs text-green-600 hover:underline">Repay</button>
    )},
  ]

  return (
    <div>
      {summary && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-lg border p-3"><div className="text-[10px] text-gray-500 uppercase">Total Loaned</div><div className="text-lg font-bold">${fmt(summary.total)}</div></div>
          <div className="bg-white rounded-lg border p-3"><div className="text-[10px] text-gray-500 uppercase">Outstanding</div><div className="text-lg font-bold">${fmt(summary.outstanding)}</div></div>
          <div className="bg-white rounded-lg border p-3"><div className="text-[10px] text-gray-500 uppercase">Active Loans</div><div className="text-lg font-bold">{summary.active_count || 0}</div></div>
        </div>
      )}

      <CrudTable title="Loans" columns={columns} rows={loans}
        onAdd={() => { setForm({}); setModal('add') }}
        onDelete={(r) => deleteMut.mutate(r.id)} />

      {modal === 'add' && (
        <FormModal title="Add Loan" onClose={() => setModal(null)} onSubmit={() => createMut.mutate(form)} loading={createMut.isPending}>
          <Input label="Borrower" value={form.borrower || ''} onChange={setF('borrower')} required />
          <Input label="Amount" type="number" step="0.01" value={form.amount || ''} onChange={setF('amount')} required />
          <Input label="Due Date" type="date" value={form.due_date || ''} onChange={setF('due_date')} />
          <Input label="Note" value={form.note || ''} onChange={setF('note')} />
        </FormModal>
      )}

      {modal === 'repay' && repayTarget && (
        <FormModal title={`Repay — ${repayTarget.borrower}`} onClose={() => setModal(null)}
          onSubmit={() => repayMut.mutate({ id: repayTarget.id, ...form })} loading={repayMut.isPending}>
          <p className="text-xs text-gray-500">Remaining: ${fmt(repayTarget.remaining)}</p>
          <Input label="Repay Amount" type="number" step="0.01" value={form.amount || ''} onChange={setF('amount')} required />
          <Input label="Note" value={form.note || ''} onChange={setF('note')} />
        </FormModal>
      )}
    </div>
  )
}

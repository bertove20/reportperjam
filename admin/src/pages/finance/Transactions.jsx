import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { finance } from '../../api/client'
import { FormModal, Input, Select } from '../../components/CrudTable'

const fmt = (n, c = 'USD') => parseFloat(n || 0).toLocaleString('id-ID', { minimumFractionDigits: c === 'IDR' ? 0 : 2 })

export default function Transactions() {
  const qc = useQueryClient()
  const now = new Date()
  const [filters, setFilters] = useState({ month: now.getMonth() + 1, year: now.getFullYear(), page: 1 })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({})

  const { data, isLoading } = useQuery({
    queryKey: ['fin-transactions', filters],
    queryFn: () => finance.transactions.list(filters),
  })
  const { data: formData } = useQuery({ queryKey: ['fin-tx-formdata'], queryFn: finance.transactions.formData })

  const createMut = useMutation({ mutationFn: (d) => finance.transactions.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-transactions'] }); setShowForm(false) } })
  const deleteMut = useMutation({ mutationFn: (id) => finance.transactions.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-transactions'] }) })

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, page: 1 })
  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Transaksi</h1>
        <button onClick={() => { setForm({}); setShowForm(true) }} className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-700">+ Add</button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3 text-sm">
        <select value={filters.month} onChange={set('month')} className="border rounded px-2 py-1 text-xs">
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>Month {m}</option>)}
        </select>
        <input type="number" value={filters.year} onChange={set('year')} className="border rounded px-2 py-1 text-xs w-16" />
        <select value={filters.brand_id || ''} onChange={set('brand_id')} className="border rounded px-2 py-1 text-xs">
          <option value="">All Brands</option>
          {formData?.brands?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-gray-400 text-sm py-8 text-center">Loading...</div>}

      {data && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Brand</th>
                <th className="px-2 py-2 text-left">Description</th>
                <th className="px-2 py-2 text-left">Category</th>
                <th className="px-2 py-2 text-left">Payment</th>
                <th className="px-2 py-2 text-right">Amount</th>
                <th className="px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions?.map(t => (
                <tr key={t.id} className="border-t hover:bg-gray-50">
                  <td className="px-2 py-1.5 text-gray-500">{t.transaction_date?.slice(0,10)}</td>
                  <td className="px-2 py-1.5">{t.brand_name}</td>
                  <td className="px-2 py-1.5 text-gray-600 truncate max-w-[200px]">{t.description}</td>
                  <td className="px-2 py-1.5">{t.category_name}</td>
                  <td className="px-2 py-1.5">{t.pm_name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">{t.currency === 'IDR' ? 'Rp' : '$'}{fmt(t.amount, t.currency)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button onClick={() => { if (confirm('Delete?')) deleteMut.mutate(t.id) }} className="text-red-500 hover:text-red-700">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-gray-500 border-t flex justify-between">
            <span>{data.total} transactions</span>
            <div className="flex gap-1">
              <button disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })} className="px-2 py-0.5 border rounded disabled:opacity-30">Prev</button>
              <button disabled={data.transactions?.length < 50} onClick={() => setFilters({ ...filters, page: filters.page + 1 })} className="px-2 py-0.5 border rounded disabled:opacity-30">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showForm && (
        <FormModal title="Add Transaction" onClose={() => setShowForm(false)} onSubmit={() => createMut.mutate(form)} loading={createMut.isPending}>
          <Select label="Brand" value={form.brand_ids} onChange={setF('brand_ids')} options={formData?.brands?.map(b => ({ value: b.id, label: b.name })) || []} />
          <Select label="Payment Method" value={form.payment_method_id} onChange={setF('payment_method_id')} options={formData?.paymentMethods?.map(p => ({ value: p.id, label: `${p.bank_name} — ${p.name} (${p.currency})` })) || []} />
          <Select label="Category" value={form.category_id} onChange={setF('category_id')} options={formData?.categories?.map(c => ({ value: c.id, label: `${c.team_name || 'General'} — ${c.name}` })) || []} />
          <Select label="Team" value={form.team_id} onChange={setF('team_id')} options={formData?.teams?.map(t => ({ value: t.id, label: t.name })) || []} />
          <Input label="Amount" type="number" step="0.01" value={form.amount || ''} onChange={setF('amount')} required />
          <Input label="Description" value={form.description || ''} onChange={setF('description')} />
          <Input label="Date" type="date" value={form.transaction_date || new Date().toISOString().split('T')[0]} onChange={setF('transaction_date')} />
        </FormModal>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { finance } from '../../api/client'
import { FormModal, Input, Select } from '../../components/CrudTable'

const fmt = (n, c = 'USD') => parseFloat(n || 0).toLocaleString('id-ID', { minimumFractionDigits: c === 'IDR' ? 0 : 2 })

export default function Balance() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null) // 'topup' | 'transfer'
  const [form, setForm] = useState({})

  const { data, isLoading } = useQuery({ queryKey: ['fin-balance'], queryFn: finance.balance.list })
  const topupMut = useMutation({ mutationFn: (d) => finance.balance.topup(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-balance'] }); setModal(null) } })
  const transferMut = useMutation({ mutationFn: (d) => finance.balance.transfer(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-balance'] }); setModal(null) } })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const wallets = data?.wallets || data || []
  const grouped = wallets.reduce((acc, w) => { (acc[w.bank_name] ||= []).push(w); return acc }, {})
  const walletOpts = wallets.map(w => ({ value: w.id, label: `${w.bank_name} — ${w.name} (${w.currency})` }))

  if (isLoading) return <div className="text-gray-400 text-sm py-12 text-center">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Wallet Balances</h1>
        <div className="flex gap-2">
          <button onClick={() => { setForm({}); setModal('topup') }} className="bg-green-600 text-white px-3 py-1.5 rounded text-xs hover:bg-green-700">+ Topup</button>
          <button onClick={() => { setForm({}); setModal('transfer') }} className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-700">Transfer</button>
        </div>
      </div>

      {Object.entries(grouped).map(([bank, items]) => (
        <div key={bank} className="bg-white rounded-lg border p-4 mb-3">
          <h2 className="text-sm font-semibold mb-2">{bank}</h2>
          <div className="space-y-1">
            {items.map(w => (
              <div key={w.id} className="flex justify-between text-xs">
                <span className="text-gray-700">{w.name}</span>
                <span className="tabular-nums font-medium">{w.currency === 'IDR' ? 'Rp' : '$'} {fmt(w.current_balance, w.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {modal === 'topup' && (
        <FormModal title="Topup Wallet" onClose={() => setModal(null)} onSubmit={() => topupMut.mutate(form)} loading={topupMut.isPending}>
          <Select label="Wallet" value={form.wallet_id || ''} onChange={setF('wallet_id')} options={walletOpts} />
          <Input label="Amount" type="number" step="0.01" value={form.amount || ''} onChange={setF('amount')} required />
          <Input label="Note" value={form.note || ''} onChange={setF('note')} />
        </FormModal>
      )}

      {modal === 'transfer' && (
        <FormModal title="Transfer" onClose={() => setModal(null)} onSubmit={() => transferMut.mutate(form)} loading={transferMut.isPending}>
          <Select label="From Wallet" value={form.from_wallet_id || ''} onChange={setF('from_wallet_id')} options={walletOpts} />
          <Select label="To Wallet" value={form.to_wallet_id || ''} onChange={setF('to_wallet_id')} options={walletOpts} />
          <Input label="Amount" type="number" step="0.01" value={form.amount || ''} onChange={setF('amount')} required />
          <Input label="Note" value={form.note || ''} onChange={setF('note')} />
        </FormModal>
      )}
    </div>
  )
}

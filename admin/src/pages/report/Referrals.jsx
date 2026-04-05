import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { referrals as referralsApi, brands as brandsApi, admin, actions } from '../../api/client'
import CrudTable, { FormModal, Input, Select } from '../../components/CrudTable'

export default function Referrals() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [sendDate, setSendDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [sendDivision, setSendDivision] = useState('')
  const [backfillStart, setBackfillStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [backfillEnd, setBackfillEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [backfillDivision, setBackfillDivision] = useState('')
  const [backfillStatus, setBackfillStatus] = useState('')

  const { data: rows = [] } = useQuery({ queryKey: ['referrals'], queryFn: () => referralsApi.list() })
  const { data: brandList = [] } = useQuery({ queryKey: ['brands-all'], queryFn: () => brandsApi.list(false) })
  const { data: divisionList = [] } = useQuery({ queryKey: ['admin-divisions'], queryFn: () => admin.divisions.list() })

  const createMut = useMutation({
    mutationFn: (d) => referralsApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['referrals'] }); setModal(false) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => referralsApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['referrals'] }); setModal(false) },
  })
  const deleteMut = useMutation({
    mutationFn: (id) => referralsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referrals'] }),
  })
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }) => referralsApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referrals'] }),
  })

  const handleToggleActive = (r) => {
    const next = r.is_active ? 0 : 1
    const action = next ? 'mengaktifkan' : 'menonaktifkan'
    if (!confirm(`${action[0].toUpperCase() + action.slice(1)} referral ${r.referral_code}?${next ? '' : '\n\nReferral nonaktif tidak akan dikirim ke Telegram dan tidak muncul di Dashboard.'}`)) return
    toggleMut.mutate({ id: r.id, is_active: next })
  }

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const openAdd = () => { setEditing(null); setForm({ is_active: 1 }); setModal(true) }
  const openEdit = (r) => {
    setEditing(r)
    setForm({
      brand_key: r.brand_key,
      referral_code: r.referral_code,
      division_id: r.division_id,
      display_name: r.display_name,
      referral_type: r.referral_type,
      is_active: r.is_active,
    })
    setModal(true)
  }

  const handleSendNow = async () => {
    if (!confirm(`Kirim referral report untuk tanggal ${sendDate}${sendDivision ? ' (divisi terpilih)' : ' (semua divisi)'}?`)) return
    try {
      await actions.referralReportNow(sendDate, sendDivision || null)
      alert('Referral report dikirim. Cek grup Telegram divisi beberapa saat lagi.')
    } catch (err) {
      alert(`Gagal: ${err.message}`)
    }
  }

  const handleBackfill = async () => {
    if (!backfillStart || !backfillEnd) { alert('Isi tanggal mulai dan akhir'); return }
    if (backfillStart > backfillEnd) { alert('Tanggal mulai harus <= tanggal akhir'); return }
    if (!confirm(`Backfill snapshot referral dari ${backfillStart} sampai ${backfillEnd}?\n\nProses jalan di background, tidak kirim ke Telegram. Cek halaman Logs (referral-backfill) untuk progress.`)) return
    setBackfillStatus('Sedang memulai...')
    try {
      await actions.referralBackfill(backfillStart, backfillEnd, backfillDivision || null)
      setBackfillStatus('Backfill dimulai. Proses berjalan di background — cek Logs untuk status.')
      setTimeout(() => setBackfillStatus(''), 8000)
    } catch (err) {
      setBackfillStatus(`Gagal: ${err.message}`)
    }
  }

  const columns = [
    { key: 'brand_key', label: 'Brand', render: r => <span className="font-mono text-xs">{r.brand_key}</span> },
    { key: 'referral_code', label: 'Referral Code', render: r => <span className="font-mono font-medium">{r.referral_code}</span> },
    { key: 'referral_type', label: 'Jenis Referall', render: r => r.referral_type || <span className="text-gray-400">—</span> },
    { key: 'display_name', label: 'Keterangan', render: r => r.display_name || <span className="text-gray-400">—</span> },
    { key: 'division_name', label: 'Division', render: r => r.division_name || <span className="text-red-500 text-xs">No division</span> },
    {
      key: 'is_active',
      label: 'Kirim ke TG',
      render: r => (
        <button
          onClick={() => handleToggleActive(r)}
          className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition hover:opacity-80 ${
            r.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
          title="Klik untuk toggle aktif/nonaktif (dikirim ke Telegram & muncul di Dashboard)"
        >
          {r.is_active ? 'Active' : 'Inactive'}
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Kirim Referral Report Manual</h2>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tanggal</label>
            <input type="date" value={sendDate} onChange={e => setSendDate(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Divisi (opsional)</label>
            <select value={sendDivision} onChange={e => setSendDivision(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm">
              <option value="">Semua divisi</option>
              {(divisionList.divisions || divisionList || []).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <button onClick={handleSendNow}
            className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700">
            Send Report Now
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Report otomatis terkirim setiap hari jam 00:05 WIB. Gunakan tombol di atas untuk test / kirim ulang manual.
        </p>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h2 className="font-semibold text-gray-900 mb-1">Backfill Snapshot Referral</h2>
        <p className="text-xs text-gray-500 mb-3">
          Mengisi data snapshot untuk rentang tanggal yang belum terupdate. <b>Tidak mengirim ke Telegram</b> — hanya mengisi database supaya muncul di Dashboard.
        </p>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Dari Tanggal</label>
            <input type="date" value={backfillStart} onChange={e => setBackfillStart(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Sampai Tanggal</label>
            <input type="date" value={backfillEnd} onChange={e => setBackfillEnd(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Divisi (opsional)</label>
            <select value={backfillDivision} onChange={e => setBackfillDivision(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm">
              <option value="">Semua divisi</option>
              {(divisionList.divisions || divisionList || []).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <button onClick={handleBackfill}
            className="bg-amber-600 text-white px-4 py-1.5 rounded text-sm hover:bg-amber-700">
            Run Backfill
          </button>
        </div>
        {backfillStatus && <div className="text-xs text-gray-700 mt-2">{backfillStatus}</div>}
      </div>

      <CrudTable title="Referral Codes" columns={columns} rows={rows}
        onAdd={openAdd} onEdit={openEdit}
        onDelete={(r) => { if (confirm(`Delete referral ${r.referral_code}?`)) deleteMut.mutate(r.id) }} />

      {modal && (
        <FormModal title={editing ? 'Edit Referral' : 'Add Referral'}
          onClose={() => setModal(false)}
          onSubmit={() => editing ? updateMut.mutate({ id: editing.id, ...form }) : createMut.mutate(form)}
          loading={createMut.isPending || updateMut.isPending}>
          <Select label="Brand" value={form.brand_key || ''} onChange={setF('brand_key')} required
            options={[
              { value: '', label: '-- pilih brand --' },
              ...brandList.map(b => ({ value: b.key, label: `${b.name} (${b.key})` })),
            ]} />
          <Input label="Referral Code" value={form.referral_code || ''} onChange={setF('referral_code')}
            placeholder="mis. pastirankp138" required />
          <Input label="Jenis Referall" value={form.referral_type || ''} onChange={setF('referral_type')}
            placeholder="mis. SUNTIK TRAFFIC, ORGANIC, PAID ADS" />
          <Input label="Keterangan" value={form.display_name || ''} onChange={setF('display_name')}
            placeholder="Catatan tambahan (opsional)" />
          <Select label="Division" value={form.division_id || ''} onChange={setF('division_id')}
            options={[
              { value: '', label: '-- pilih divisi --' },
              ...(divisionList.divisions || divisionList || []).map(d => ({ value: d.id, label: d.name })),
            ]} />
          <Select label="Active" value={form.is_active ?? '1'} onChange={setF('is_active')}
            options={[{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }]} />
        </FormModal>
      )}
    </div>
  )
}

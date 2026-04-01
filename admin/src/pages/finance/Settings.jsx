import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settings } from '../../api/client'
import { Input, Select } from '../../components/CrudTable'

export default function FinanceSettings() {
  const qc = useQueryClient()
  const [form, setForm] = useState({})

  const { data, isLoading } = useQuery({
    queryKey: ['settings-finance'],
    queryFn: () => settings.get('finance'),
  })

  useEffect(() => {
    if (data) setForm(data.settings || data || {})
  }, [data])

  const updateMut = useMutation({
    mutationFn: (d) => settings.update({ module: 'finance', ...d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-finance'] }),
  })
  const testMut = useMutation({ mutationFn: () => settings.testTelegram('finance') })

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  if (isLoading) return <div className="text-gray-400 text-sm py-12 text-center">Loading...</div>

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-5">Finance Settings</h1>

      <div className="bg-white rounded-lg border p-5 max-w-lg space-y-4">
        <Input label="Telegram Bot Token" value={form.tg_bot_token || ''} onChange={setF('tg_bot_token')} />
        <Input label="Telegram Group ID" value={form.tg_group_id || ''} onChange={setF('tg_group_id')} />
        <Select label="Default Currency" value={form.default_currency || ''} onChange={setF('default_currency')}
          options={[{ value: 'USD', label: 'USD' }, { value: 'IDR', label: 'IDR' }]} />

        <div className="flex gap-2 pt-2">
          <button onClick={() => updateMut.mutate(form)} disabled={updateMut.isPending}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {updateMut.isPending ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => testMut.mutate()} disabled={testMut.isPending}
            className="bg-gray-100 px-4 py-1.5 rounded text-sm hover:bg-gray-200 disabled:opacity-50">
            {testMut.isPending ? 'Sending...' : 'Test Telegram'}
          </button>
        </div>

        {updateMut.isSuccess && <p className="text-xs text-green-600">Settings saved.</p>}
        {testMut.isSuccess && <p className="text-xs text-green-600">Test message sent!</p>}
        {(updateMut.isError || testMut.isError) && <p className="text-xs text-red-600">{updateMut.error?.message || testMut.error?.message}</p>}
      </div>
    </div>
  )
}

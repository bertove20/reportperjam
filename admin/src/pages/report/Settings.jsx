import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { settings as settingsApi, auth } from '../../api/client'

export default function Settings() {
  const [form, setForm] = useState({})
  const [saved, setSaved] = useState(false)
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '' })
  const [pwMsg, setPwMsg] = useState('')

  const { data: currentSettings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get('report'),
  })

  const saveMutation = useMutation({
    mutationFn: (data) => settingsApi.update({ ...data, module: 'report' }),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000) },
  })

  useEffect(() => {
    if (currentSettings) setForm(currentSettings)
  }, [currentSettings])

  const testTgMutation = useMutation({
    mutationFn: () => settingsApi.testTelegram('report'),
  })

  const changePwMutation = useMutation({
    mutationFn: () => auth.changePassword(pwForm.oldPassword, pwForm.newPassword),
    onSuccess: () => { setPwMsg('Password changed!'); setPwForm({ oldPassword: '', newPassword: '' }) },
    onError: (err) => setPwMsg(err.message),
  })

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  if (isLoading) return <div className="text-gray-500">Loading...</div>

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Telegram */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <h2 className="font-semibold text-gray-900">Telegram</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bot Token</label>
          <input value={form.tg_bot_token || ''} onChange={set('tg_bot_token')}
            className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder="123456:ABC..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Report Group ID</label>
          <input value={form.tg_report_group || ''} onChange={set('tg_report_group')}
            className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder="-1001234567890" />
        </div>
        <button onClick={() => testTgMutation.mutate()} disabled={testTgMutation.isPending}
          className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50">
          {testTgMutation.isPending ? 'Sending...' : 'Test Telegram'}
        </button>
        {testTgMutation.isSuccess && <span className="text-green-600 text-sm ml-2">Test sent!</span>}
        {testTgMutation.isError && <span className="text-red-600 text-sm ml-2">{testTgMutation.error.message}</span>}
      </div>

      {/* Schedule */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <h2 className="font-semibold text-gray-900">Schedule</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <input value={form.timezone || ''} onChange={set('timezone')}
            className="w-full border rounded px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cron Fetch</label>
            <input value={form.cron_fetch || ''} onChange={set('cron_fetch')}
              className="w-full border rounded px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cron Report</label>
            <input value={form.cron_report || ''} onChange={set('cron_report')}
              className="w-full border rounded px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cron Finish</label>
            <input value={form.cron_finish || ''} onChange={set('cron_finish')}
              className="w-full border rounded px-3 py-2 text-sm font-mono" />
          </div>
        </div>
      </div>

      <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}
        className="bg-blue-600 text-white px-6 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
        {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
      </button>
      {saved && <span className="text-green-600 text-sm ml-2">Saved!</span>}

      {/* Change Password */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <h2 className="font-semibold text-gray-900">Change Password</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
          <input type="password" value={pwForm.oldPassword}
            onChange={e => setPwForm({ ...pwForm, oldPassword: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
          <input type="password" value={pwForm.newPassword}
            onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" />
        </div>
        <button onClick={() => changePwMutation.mutate()} disabled={changePwMutation.isPending}
          className="bg-gray-900 text-white px-4 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50">
          Change Password
        </button>
        {pwMsg && <span className="text-sm ml-2">{pwMsg}</span>}
      </div>
    </div>
  )
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { brands as brandsApi, actions } from '../../api/client'

export default function BrandList() {
  const queryClient = useQueryClient()
  const { data: brandList = [], isLoading } = useQuery({
    queryKey: ['brands'],
    queryFn: () => brandsApi.list(false),
  })

  const deleteMutation = useMutation({
    mutationFn: (key) => brandsApi.delete(key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brands'] }),
  })

  const testMutation = useMutation({
    mutationFn: (key) => brandsApi.test(key),
  })

  const handleTest = async (key) => {
    try {
      const result = await testMutation.mutateAsync(key)
      alert(`Test OK! TRX: ${result.trx}, REGIS: ${result.regis}`)
    } catch (err) {
      alert(`Test failed: ${err.message}`)
    }
  }

  const handleFetch = async (key) => {
    await actions.fetchNow(key)
    alert(`Fetch started for ${key}`)
  }

  const handleSendReport = async (key, name) => {
    if (!confirm(`Kirim report Telegram untuk ${name} sekarang?`)) return
    try {
      await actions.reportNow(key)
      alert(`Report terkirim untuk ${name}. Cek grup Telegram.`)
    } catch (err) {
      alert(`Send report gagal: ${err.message}`)
    }
  }

  const reorder = async (newList) => {
    const updates = newList
      .map((b, i) => (b.sort_order !== i ? brandsApi.update(b.key, { sort_order: i }) : null))
      .filter(Boolean)
    if (updates.length === 0) return
    await Promise.all(updates)
    queryClient.invalidateQueries({ queryKey: ['brands'] })
  }

  const handleMoveUp = async (index) => {
    if (index === 0) return
    const newList = [...brandList]
    ;[newList[index - 1], newList[index]] = [newList[index], newList[index - 1]]
    await reorder(newList)
  }

  const handleMoveDown = async (index) => {
    if (index >= brandList.length - 1) return
    const newList = [...brandList]
    ;[newList[index], newList[index + 1]] = [newList[index + 1], newList[index]]
    await reorder(newList)
  }

  const handleToggleActive = async (brand) => {
    const next = brand.is_active ? 0 : 1
    const action = next ? 'mengaktifkan' : 'menonaktifkan'
    if (!confirm(`Yakin ${action} brand ${brand.name}?${next ? '' : '\n\nBrand yang nonaktif tidak akan ikut cron fetch & kirim report.'}`)) return
    try {
      await brandsApi.update(brand.key, { is_active: next })
      queryClient.invalidateQueries({ queryKey: ['brands'] })
    } catch (err) {
      alert(`Gagal update status: ${err.message}`)
    }
  }

  const handleLogin = async (key, name) => {
    alert(`Browser akan terbuka untuk login ${name}.\n\nLogin manual di browser, setelah masuk dashboard tunggu cookie otomatis tercapture.`)
    try {
      const result = await brandsApi.login(key)
      alert(`Login berhasil! Cookie ${name} tersimpan.`)
      queryClient.invalidateQueries({ queryKey: ['brands'] })
    } catch (err) {
      alert(`Login gagal: ${err.message}`)
    }
  }

  if (isLoading) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Brand Management</h1>
        <Link to="/report/brands/new" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
          + Add Brand
        </Link>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-center w-20">Order</th>
              <th className="px-4 py-3 text-left">Brand</th>
              <th className="px-4 py-3 text-left">Engine</th>
              <th className="px-4 py-3 text-left">Domain</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-left">Color</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {brandList.map((brand, index) => (
              <tr key={brand.key} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Pindah ke atas"
                    >
                      ↑
                    </button>
                    <span className="text-xs text-gray-500 w-4 text-center">{index + 1}</span>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === brandList.length - 1}
                      className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Pindah ke bawah"
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{brand.name}</div>
                  <div className="text-xs text-gray-500">{brand.key}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{brand.engine}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{brand.domain}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleToggleActive(brand)}
                    className={`px-2 py-0.5 rounded text-xs cursor-pointer transition hover:opacity-80 ${brand.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                    title="Klik untuk mengaktifkan/menonaktifkan brand"
                  >
                    {brand.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: brand.primary_color }}></div>
                    <span className="text-xs text-gray-500">{brand.primary_color}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1 justify-end">
                    {brand.engine === 'asia77' && (
                      <button onClick={() => handleLogin(brand.key, brand.name)} className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200">
                        Login
                      </button>
                    )}
                    <button onClick={() => handleTest(brand.key)} className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">
                      Test
                    </button>
                    <button onClick={() => handleFetch(brand.key)} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                      Fetch
                    </button>
                    <button onClick={() => handleSendReport(brand.key, brand.name)} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">
                      Send Report
                    </button>
                    <Link to={`/report/brands/${brand.key}/edit`} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                      Edit
                    </Link>
                    <button
                      onClick={() => { if (confirm(`Delete ${brand.name}?`)) deleteMutation.mutate(brand.key) }}
                      className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {brandList.length === 0 && (
          <div className="text-center py-8 text-gray-500">No brands configured. Add one to get started.</div>
        )}
      </div>
    </div>
  )
}

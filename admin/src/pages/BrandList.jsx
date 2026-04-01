import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { brands as brandsApi, actions } from '../api/client'

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
        <Link to="/brands/new" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
          + Add Brand
        </Link>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Brand</th>
              <th className="px-4 py-3 text-left">Engine</th>
              <th className="px-4 py-3 text-left">Domain</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-left">Color</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {brandList.map(brand => (
              <tr key={brand.key} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{brand.name}</div>
                  <div className="text-xs text-gray-500">{brand.key}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{brand.engine}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{brand.domain}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs ${brand.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {brand.is_active ? 'Active' : 'Inactive'}
                  </span>
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
                    <Link to={`/brands/${brand.key}/edit`} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
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

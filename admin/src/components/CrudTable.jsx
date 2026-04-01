/**
 * Reusable CRUD Table — shared component untuk semua halaman CRUD
 * Mengurangi duplikasi code di setiap page
 */

import { useState } from 'react'

export default function CrudTable({ title, columns, rows, onAdd, onEdit, onDelete, addLabel = '+ Add' }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {onAdd && (
          <button onClick={onAdd} className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-blue-700">
            {addLabel}
          </button>
        )}
      </div>
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(col => (
                <th key={col.key} className={`px-3 py-2 text-${col.align || 'left'} text-xs text-gray-500 uppercase`}>
                  {col.label}
                </th>
              ))}
              {(onEdit || onDelete) && <th className="px-3 py-2 text-right text-xs text-gray-500">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id || i} className="border-t hover:bg-gray-50">
                {columns.map(col => (
                  <td key={col.key} className={`px-3 py-2 text-${col.align || 'left'} ${col.className || ''}`}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
                {(onEdit || onDelete) && (
                  <td className="px-3 py-2 text-right space-x-1">
                    {onEdit && <button onClick={() => onEdit(row)} className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200">Edit</button>}
                    {onDelete && <button onClick={() => { if (confirm('Delete?')) onDelete(row) }} className="px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Del</button>}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-gray-400">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Simple modal for add/edit forms
 */
export function FormModal({ title, onClose, onSubmit, children, loading }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        <form onSubmit={e => { e.preventDefault(); onSubmit() }} className="space-y-3">
          {children}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={onClose} className="bg-gray-100 px-4 py-1.5 rounded text-sm hover:bg-gray-200">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function Input({ label, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>}
      <input className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" {...props} />
    </div>
  )
}

export function Select({ label, options = [], ...props }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>}
      <select className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" {...props}>
        <option value="">— Select —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

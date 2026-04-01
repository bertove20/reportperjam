import { useState, useEffect } from 'react'

export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('darkMode') === 'true'
  })

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('darkMode', dark)
  }, [dark])

  const toggle = () => setDark(prev => !prev)

  return { dark, toggle }
}

import { useEffect, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ThemeContext } from './theme'
import type { ThemeMode } from './theme'

function storedMode(): ThemeMode {
  try {
    const saved = localStorage.getItem('windscope-theme')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch { return 'system' }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(storedMode)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useLayoutEffect(() => {
    if (mode === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = mode
    try { localStorage.setItem('windscope-theme', mode) } catch { /* Storage can be disabled. */ }
  }, [mode])
  return <ThemeContext.Provider value={{ mode, resolved,
    cycle: () => setMode(mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'),
  }}>{children}</ThemeContext.Provider>
}

import { createContext, useContext } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export const ThemeContext = createContext({ mode: 'system' as ThemeMode, resolved: 'light', cycle: () => {} })
export const useTheme = () => useContext(ThemeContext)

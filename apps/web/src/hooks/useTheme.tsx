import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type Theme = 'dark' | 'light'
type ThemeSource = 'system' | 'explicit'

interface ThemeContextType {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  themeSource: ThemeSource
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const STORAGE_KEY = 'citadelmd-theme'
const SOURCE_KEY = 'citadelmd-theme-source'

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme)
  const [explicitTheme, setExplicitTheme] = useState<Theme | null>(() => {
    if (typeof window !== 'undefined') {
      const source = localStorage.getItem(SOURCE_KEY)
      if (source === 'explicit') {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored === 'light' || stored === 'dark') return stored
      }
    }
    return null
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const theme = explicitTheme ?? systemTheme
  const themeSource: ThemeSource = explicitTheme ? 'explicit' : 'system'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t)
    localStorage.setItem(SOURCE_KEY, 'explicit')
    setExplicitTheme(t)
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, themeSource }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { STORAGE_KEYS, readStorage, writeStorage } from '@/lib/utils/storage'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeValue {
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeCtx = createContext<ThemeValue | null>(null)

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Light is the default; dark or system applies only when the user picks it.
  const [theme, setThemeState] = useState<Theme>('light')
  const [resolved, setResolved] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    setThemeState(readStorage<Theme>(STORAGE_KEYS.theme, 'light'))
  }, [])

  useEffect(() => {
    const apply = () => {
      const next = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme
      setResolved(next)
      document.documentElement.classList.toggle('dark', next === 'dark')
      document.documentElement.style.colorScheme = next
    }
    apply()

    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    writeStorage(STORAGE_KEYS.theme, next)
  }, [])

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme])
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

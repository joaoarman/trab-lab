import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'selfos.theme'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function lerPreferencia(): Theme {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY)
    if (salvo === 'light' || salvo === 'dark' || salvo === 'system') return salvo
  } catch {
    // localStorage bloqueado: cai no padrão
  }
  return 'system'
}

function consultaEscuro(): MediaQueryList {
  return window.matchMedia('(prefers-color-scheme: dark)')
}

function resolver(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return consultaEscuro().matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(lerPreferencia)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolver(theme))

  useEffect(() => {
    const aplicar = () => {
      const resolvido = resolver(theme)
      setResolvedTheme(resolvido)
      document.documentElement.classList.toggle('dark', resolvido === 'dark')
    }

    aplicar()

    if (theme !== 'system') return

    const consulta = consultaEscuro()
    consulta.addEventListener('change', aplicar)
    return () => consulta.removeEventListener('change', aplicar)
  }, [theme])

  const setTheme = (novo: Theme) => {
    setThemeState(novo)
    try {
      localStorage.setItem(STORAGE_KEY, novo)
    } catch {
      // localStorage bloqueado: o tema vale só nesta aba
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const contexto = useContext(ThemeContext)
  if (!contexto) throw new Error('useTheme precisa estar dentro de <ThemeProvider>')
  return contexto
}

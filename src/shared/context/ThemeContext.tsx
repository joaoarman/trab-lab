import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Tema do app (claro / escuro / seguir o sistema).
 *
 * O que é aplicado no DOM é a classe `.dark` no `<html>` — é ela que liga o bloco
 * `.dark` do `src/theme.css` e o `darkMode: ['class']` do Tailwind.
 *
 * ## Por que existe "system", e não só um interruptor
 *
 * "Escuro" e "seguir o sistema" são preferências DIFERENTES: quem escolhe
 * escuro quer escuro sempre; quem segue o sistema quer que o app acompanhe o
 * aparelho quando ele vira à noite. Um interruptor de dois estados obriga a
 * segunda pessoa a escolher manualmente duas vezes por dia.
 *
 * ## Anti-flash
 *
 * A classe também é aplicada por um script no `<head>` do `index.html`, ANTES do
 * React montar. Sem ele o navegador pinta o primeiro quadro com o tema claro e
 * só depois o React troca — o clarão branco de um quadro na tela escura. Os dois
 * lugares leem a MESMA chave (`STORAGE_KEY`) e aplicam a mesma regra; mexeu aqui,
 * mexa lá.
 */
export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'selfos.theme'

interface ThemeContextValue {
  /** A preferência escolhida (pode ser 'system'). */
  theme: Theme
  /** O que está REALMENTE na tela agora — 'system' já resolvido. */
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function lerPreferencia(): Theme {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY)
    if (salvo === 'light' || salvo === 'dark' || salvo === 'system') return salvo
  } catch {
    // Sem armazenamento (aba anônima do Safari, cookies bloqueados): segue o sistema.
  }
  return 'system'
}

/** A consulta que diz se o SISTEMA está no escuro. Uma só, reusada. */
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

  // Aplica no `<html>` sempre que a preferência muda.
  useEffect(() => {
    const aplicar = () => {
      const resolvido = resolver(theme)
      setResolvedTheme(resolvido)
      document.documentElement.classList.toggle('dark', resolvido === 'dark')
    }

    aplicar()

    // Só faz sentido ouvir o sistema quando a preferência é justamente segui-lo —
    // em 'light' ou 'dark' o usuário já decidiu, e o aparelho não tem voto.
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
      // Sem armazenamento: a escolha vale só nesta sessão.
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

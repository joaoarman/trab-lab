import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'
import { BOTTOM_NAV_ITEMS } from './navigation'

/**
 * A barra de abas do celular — o que se usa todo dia, a um toque.
 *
 * Só aparece abaixo de `lg`; no desktop quem navega é a sidebar. Quem entra aqui
 * é decidido pelo campo `bottomNav` em `navigation.ts`, e o porquê do critério
 * está lá: a barra divide a largura do aparelho, então cada aba a mais encolhe
 * as outras.
 *
 * A altura vem de `--bottom-nav-height` (src/theme.css) — o MESMO token que o
 * `<main>` usa para reservar o espaço embaixo. Dois números escritos à mão
 * divergiriam, e a sobra viraria um vão morto embaixo do campo de escrever do
 * chat, a única tela que encosta na barra.
 *
 * `env(safe-area-inset-bottom)` é a faixa do gesto de voltar do iPhone: sem
 * somá-la, os rótulos ficariam por baixo da barrinha do sistema.
 */
export function BottomNav() {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('nav.primaryLabel')}
      className="fixed inset-x-0 bottom-0 z-40 h-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="flex h-full items-stretch">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 px-1 py-2 text-xs font-medium outline-none ring-inset ring-ring transition-colors focus-visible:ring-2',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-8 w-16 items-center justify-center rounded-full transition-colors',
                      isActive && 'bg-primary-muted',
                    )}
                  >
                    <item.icon className="size-5" aria-hidden />
                  </span>
                  <span className="max-w-full truncate">{t(item.labelKey)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Menu } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Brand } from './Brand'
import { UserMenu } from './UserMenu'
import { findActiveItem } from './navigation'

export function Header({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const ativo = findActiveItem(pathname)

  // O pt-[env(safe-area-inset-top)] é 0 no navegador e vira a altura do relógio
  // quando o app está instalado (status bar translúcida): sem ele, o título ficaria
  // por baixo da hora e da bateria no iPhone.
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-content items-center gap-3 px-content">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 lg:hidden"
          aria-label={t('nav.openMenu')}
          onClick={onAbrirMenu}
        >
          <Menu className="size-5" aria-hidden />
        </Button>

        <Brand compact className="lg:hidden" />

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-semibold leading-tight">
            {ativo ? t(ativo.labelKey) : t('brand.name')}
          </h1>
          {ativo && (
            <p className="truncate text-sm leading-tight text-muted-foreground max-sm:hidden">
              {t(ativo.subtitleKey)}
            </p>
          )}
        </div>

        <div className="lg:hidden">
          <UserMenu variant="compact" />
        </div>
      </div>
    </header>
  )
}

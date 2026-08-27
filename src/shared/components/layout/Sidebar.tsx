import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Brand } from './Brand'
import { UserMenu } from './UserMenu'
import { NAV_ITEMS, MODULOS_FUTUROS, type NavItem, type ModuloFuturo } from './navigation'

function ModuleLink({ item, onNavegar }: { item: NavItem; onNavegar?: () => void }) {
  const { t } = useTranslation()

  return (
    <NavLink
      to={item.to}
      onClick={onNavegar}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium outline-none ring-ring transition-colors focus-visible:ring-2',
          isActive
            ? 'bg-primary-muted text-primary-muted-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <item.icon className="size-5 shrink-0" aria-hidden />
      {t(item.labelKey)}
    </NavLink>
  )
}

function ModuloFuturoLink({ item }: { item: ModuloFuturo }) {
  const { t } = useTranslation()

  return (
    <div className="flex cursor-not-allowed select-none items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-muted-foreground/70">
      <item.icon className="size-5 shrink-0" aria-hidden />
      <span className="truncate">{t(item.labelKey)}</span>
      <Badge
        variant="secondary"
        className="ml-auto shrink-0 px-1.5 py-0 text-[0.625rem] font-semibold"
      >
        {t('nav.comingSoon')}
      </Badge>
    </div>
  )
}

function Conteudo({ onNavegar }: { onNavegar?: () => void }) {
  const { t } = useTranslation()

  return (
    <>
      <nav
        aria-label={t('nav.primaryLabel')}
        className="flex flex-1 flex-col overflow-y-auto px-3 py-4"
      >
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <ModuleLink key={item.to} item={item} onNavegar={onNavegar} />
          ))}
        </div>

        <div className="mt-auto space-y-1 pt-8">
          <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {t('nav.upcoming')}
          </p>
          {MODULOS_FUTUROS.map((item) => (
            <ModuloFuturoLink key={item.labelKey} item={item} />
          ))}
        </div>
      </nav>

      <div className="border-t border-border p-3">
        <UserMenu />
      </div>
    </>
  )
}

export function Sidebar({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const { t } = useTranslation()
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberta, onFechar])

  useEffect(() => {
    if (aberta) painel.current?.focus()
  }, [aberta])

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <Brand />
        </div>
        <Conteudo />
      </aside>

      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden',
          aberta ? 'visible' : 'pointer-events-none invisible',
        )}
        aria-hidden={!aberta}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={t('nav.closeMenu')}
          onClick={onFechar}
          className={cn(
            'absolute inset-0 bg-foreground/40 transition-opacity duration-200',
            aberta ? 'opacity-100' : 'opacity-0',
          )}
        />

        <div
          ref={painel}
          role="dialog"
          aria-modal="true"
          aria-label={t('nav.primaryLabel')}
          tabIndex={-1}
          className={cn(
            'absolute inset-y-0 left-0 flex w-[17rem] max-w-[85%] flex-col border-r border-border bg-card pt-[env(safe-area-inset-top)] shadow-xl outline-none transition-transform duration-200 ease-out',
            aberta ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
            <Brand />
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto shrink-0"
              aria-label={t('nav.closeMenu')}
              onClick={onFechar}
            >
              <X className="size-5" aria-hidden />
            </Button>
          </div>
          <Conteudo onNavegar={onFechar} />
        </div>
      </div>
    </>
  )
}

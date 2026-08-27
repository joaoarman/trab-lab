import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'
import { BOTTOM_NAV_ITEMS } from './navigation'

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

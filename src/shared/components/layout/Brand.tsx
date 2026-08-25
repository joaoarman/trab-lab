import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CircleDollarSign } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

/**
 * A marca do sistema. `compact` mostra só o símbolo — é o que cabe no header do
 * celular, onde o nome já aparece na gaveta.
 *
 * O nome e a tagline vêm do i18n (`brand.name` / `brand.tagline`), não de uma
 * constante: é o único jeito de o produto se chamar a mesma coisa nas duas
 * línguas sem uma segunda cópia do texto.
 */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { t } = useTranslation()

  return (
    <Link
      to="/"
      aria-label={t('brand.name')}
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-md outline-none ring-ring transition-opacity hover:opacity-90 focus-visible:ring-2',
        className,
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
        <CircleDollarSign className="size-5" strokeWidth={2.5} aria-hidden />
      </span>
      {!compact && (
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base font-semibold leading-tight">
            {t('brand.name')}
          </span>
          <span className="block truncate text-xs leading-tight text-muted-foreground">
            {t('brand.tagline')}
          </span>
        </span>
      )}
    </Link>
  )
}

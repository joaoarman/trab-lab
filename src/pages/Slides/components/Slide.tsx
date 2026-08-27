import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

export function Slide({
  eyebrow,
  title,
  children,
  footer,
  className,
}: {
  eyebrow?: string
  title?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'flex h-full flex-col gap-5 overflow-y-auto px-5 py-6 sm:gap-7 sm:px-10 sm:py-9 lg:gap-8 lg:px-16 lg:py-12',
        className,
      )}
    >
      {(eyebrow || title) && (
        <header className="shrink-0 space-y-1.5">
          {eyebrow && (
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-primary sm:text-xs">
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 className="text-balance font-display text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl xl:text-[2.75rem]">
              {title}
            </h2>
          )}
        </header>
      )}

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 sm:gap-6">{children}</div>

      {footer && <div className="shrink-0">{footer}</div>}
    </section>
  )
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="text-pretty rounded-md bg-primary-muted px-4 py-3 font-display text-base font-medium text-primary-muted-foreground sm:text-lg lg:text-xl">
      {children}
    </p>
  )
}

export function Bullets({ itens }: { itens: string[] }) {
  return (
    <ul className="space-y-3 sm:space-y-4">
      {itens.map((texto) => (
        <li key={texto} className="flex gap-3 text-pretty sm:gap-4">
          <span
            className="mt-2 size-2 shrink-0 rounded-full bg-primary sm:mt-2.5 sm:size-2.5"
            aria-hidden
          />
          <span className="text-base leading-snug sm:text-lg lg:text-xl xl:text-2xl">{texto}</span>
        </li>
      ))}
    </ul>
  )
}

export function Codigo({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[0.625rem] leading-relaxed sm:text-[0.6875rem] lg:text-xs xl:text-sm">
      <code>{children}</code>
    </pre>
  )
}

export function Grade({
  colunas = 3,
  children,
  className,
}: {
  colunas?: 2 | 3 | 4
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid gap-3 sm:gap-4',
        colunas === 2 && 'sm:grid-cols-2',
        colunas === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        colunas === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Cartao({
  title,
  children,
  aside,
  className,
}: {
  title: string
  children?: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border bg-card p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold sm:text-lg lg:text-xl">{title}</h3>
        {aside}
      </div>
      {children && (
        <div className="text-pretty text-sm leading-snug text-muted-foreground sm:text-base lg:text-lg">
          {children}
        </div>
      )}
    </div>
  )
}

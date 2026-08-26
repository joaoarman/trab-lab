import { Toaster as Sonner, toast } from 'sonner'

import { useTheme } from '@/shared/context/ThemeContext'

/**
 * Toaster — o aviso curto que aparece e some sozinho ("Alterações salvas").
 *
 * Montado uma vez no `App.tsx`; as telas só chamam `toast.success(...)`.
 *
 * O tema vem do `resolvedTheme` do projeto (já com 'system' resolvido), e não do
 * `next-themes` que o shadcn usa por padrão — este projeto tem o próprio
 * provider de tema. As cores saem dos tokens do `src/theme.css` via
 * `toastOptions`, para o toast não trazer a paleta própria do sonner e destoar
 * do resto do app.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'group flex items-center gap-2 rounded-md border border-border bg-card p-4 text-sm text-card-foreground shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          success: '[&_[data-icon]]:text-primary',
          error: '[&_[data-icon]]:text-destructive',
        },
      }}
    />
  )
}

export { toast }

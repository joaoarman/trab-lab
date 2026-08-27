import { Toaster as Sonner, toast } from 'sonner'

import { useTheme } from '@/shared/context/ThemeContext'

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

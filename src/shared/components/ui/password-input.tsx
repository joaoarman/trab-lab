import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowBigUp, Eye, EyeOff } from 'lucide-react'

import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'>
>(({ className, onKeyDown, onKeyUp, onBlur, ...props }, ref) => {
  const { t } = useTranslation()
  const [visivel, setVisivel] = React.useState(false)
  const [capsLock, setCapsLock] = React.useState(false)

  const verificarCapsLock = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(evento.getModifierState('CapsLock'))
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          ref={ref}
          type={visivel ? 'text' : 'password'}
          className={cn('pr-10', className)}
          onKeyDown={(evento) => {
            verificarCapsLock(evento)
            onKeyDown?.(evento)
          }}
          onKeyUp={(evento) => {
            verificarCapsLock(evento)
            onKeyUp?.(evento)
          }}
          onBlur={(evento) => {
            setCapsLock(false)
            onBlur?.(evento)
          }}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisivel((atual) => !atual)}
          aria-label={visivel ? t('auth.password.hide') : t('auth.password.show')}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none ring-ring transition-colors hover:text-foreground focus-visible:ring-1"
        >
          {visivel ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>

      {capsLock && (
        <p className="flex items-center gap-1 text-xs text-warning">
          <ArrowBigUp className="size-3.5" aria-hidden />
          {t('auth.password.capsLock')}
        </p>
      )}
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'

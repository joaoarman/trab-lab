import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowBigUp, Eye, EyeOff } from 'lucide-react'

import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'

/**
 * PasswordInput — o `Input` do projeto com as duas coisas que todo campo de
 * senha precisa ter.
 *
 * **Ver/ocultar.** Digitar uma senha às cegas num teclado de celular é onde os
 * erros de digitação nascem, e neste projeto um erro de digitação custa caro:
 * não há recuperação de senha (ver `PENDENCIAS.md`), então uma senha
 * cadastrada errada tranca a conta para sempre.
 *
 * **Aviso de Caps Lock.** É a causa nº 1 de "minha senha está certa e não
 * entra", e o navegador não avisa. Aparece só enquanto o campo está em foco COM
 * a tecla ligada — um aviso permanente vira ruído.
 *
 * Como é um primitivo (o campo de senha é o mesmo no login, no cadastro e na
 * troca de senha), mora em `ui/` e não na pasta de um módulo.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'>
>(({ className, onKeyDown, onKeyUp, onBlur, ...props }, ref) => {
  const { t } = useTranslation()
  const [visivel, setVisivel] = React.useState(false)
  const [capsLock, setCapsLock] = React.useState(false)

  // `getModifierState` responde pelo estado da tecla no momento do evento — é o
  // único jeito de saber, já que não existe evento de "Caps Lock mudou".
  const verificarCapsLock = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(evento.getModifierState('CapsLock'))
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          ref={ref}
          type={visivel ? 'text' : 'password'}
          // O espaço à direita é do botão do olho; sem ele o texto passa por baixo.
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
          // `tabIndex={-1}` de propósito: quem navega pelo teclado quer sair do
          // campo de senha direto para o botão de entrar, não parar num controle
          // de visualização no meio do caminho.
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

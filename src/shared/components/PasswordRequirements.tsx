import { useTranslation } from 'react-i18next'
import { Check, Circle } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

interface Requisito {
  chave: string
  atende: (senha: string) => boolean
}

export const COMPRIMENTO_MINIMO_DA_SENHA = 6

const REQUISITOS: Requisito[] = [
  { chave: 'length', atende: (s) => s.length >= COMPRIMENTO_MINIMO_DA_SENHA },
  { chave: 'lower', atende: (s) => /[a-z]/.test(s) },
  { chave: 'upper', atende: (s) => /[A-Z]/.test(s) },
  { chave: 'digit', atende: (s) => /[0-9]/.test(s) },
  { chave: 'symbol', atende: (s) => /[^a-zA-Z0-9]/.test(s) },
]

export function senhaValida(senha: string): boolean {
  return REQUISITOS.every((requisito) => requisito.atende(senha))
}

export function PasswordRequirements({ senha }: { senha: string }) {
  const { t } = useTranslation()

  return (
    <ul className="space-y-1">
      {REQUISITOS.map((requisito) => {
        const ok = requisito.atende(senha)
        return (
          <li
            key={requisito.chave}
            className={cn(
              'flex items-center gap-1.5 text-xs transition-colors',
              ok ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {ok ? (
              <Check className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <Circle className="size-3.5 shrink-0" aria-hidden />
            )}
            {t(`auth.passwordRules.${requisito.chave}`, {
              min: COMPRIMENTO_MINIMO_DA_SENHA,
            })}
          </li>
        )
      })}
    </ul>
  )
}

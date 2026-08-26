import { useTranslation } from 'react-i18next'
import { Check, Circle } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

/**
 * A lista de requisitos da senha, marcando cada um conforme a pessoa digita.
 *
 * ## Por que existe
 *
 * A regra do projeto é a mais rígida que o Supabase oferece
 * (`lower_upper_letters_digits_symbols` no `supabase/config.toml`): minúscula,
 * MAIÚSCULA, dígito e símbolo, com no mínimo 6 caracteres. Sem esta lista, a
 * pessoa descobre a regra sendo recusada — e é recusada pelo servidor, com uma
 * mensagem em inglês, depois de já ter preenchido o formulário inteiro.
 *
 * ## Por que é um componente compartilhado
 *
 * Ele aparece no **cadastro** e na **troca de senha** (módulos diferentes). A
 * regra também é uma só, e duplicá-la seria pedir para as duas telas divergirem
 * da configuração do servidor em momentos diferentes.
 *
 * A validação aqui é conveniência, não segurança: quem chamar a API direto passa
 * por fora dela. Quem realmente recusa a senha fraca é o Supabase, pelo
 * `password_requirements`. Por isso os dois precisam dizer a mesma coisa — mexeu
 * no `config.toml`, mexa aqui.
 */
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
  // "Símbolo" = qualquer coisa que não seja letra nem dígito. Uma lista fechada
  // de pontuação recusaria acentos e caracteres de outros teclados sem motivo.
  { chave: 'symbol', atende: (s) => /[^a-zA-Z0-9]/.test(s) },
]

/** Se a senha atende a TODOS os requisitos. Usada para habilitar o botão. */
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

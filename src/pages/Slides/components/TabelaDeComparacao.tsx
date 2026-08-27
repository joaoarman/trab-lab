import { useTranslation } from 'react-i18next'
import { Check, Minus, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { COMPARACAO, PRODUTOS_COMPARADOS, type Suporte } from '../conteudo'

const ICONES: Record<Suporte, typeof Check> = {
  SIM: Check,
  PARCIAL: Minus,
  NAO: X,
}

const CORES: Record<Suporte, string> = {
  SIM: 'text-income',
  PARCIAL: 'text-warning',
  NAO: 'text-muted-foreground/50',
}

export function TabelaDeComparacao() {
  const { t } = useTranslation()

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-3" />
            {PRODUTOS_COMPARADOS.map((produto) => (
              <th
                key={produto}
                className={cn(
                  'px-2 py-2 text-center align-bottom text-xs font-semibold leading-tight sm:text-sm',
                  produto === 'selfos' ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {t(`slides.comparacao.produtos.${produto}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARACAO.map(({ id, valores }) => (
            <tr key={id} className="border-b border-border/60 last:border-0">
              <td className="text-pretty py-2.5 pr-3 text-sm leading-snug sm:text-base lg:text-lg">
                {t(`slides.comparacao.criterios.${id}`)}
              </td>
              {PRODUTOS_COMPARADOS.map((produto) => {
                const valor = valores[produto]
                const Icone = ICONES[valor]
                return (
                  <td
                    key={produto}
                    className={cn('px-2 py-2.5 text-center', produto === 'selfos' && 'bg-primary-muted/50')}
                  >
                    <Icone className={cn('mx-auto size-5', CORES[valor])} aria-hidden />
                    <span className="sr-only">{t(`slides.comparacao.valores.${valor}`)}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

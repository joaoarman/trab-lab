import { useTranslation } from 'react-i18next'
import { Check, Clock } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { Prioridade, Requisito } from '../conteudo'

const CORES: Record<Prioridade, string> = {
  ESSENCIAL: 'bg-primary-muted text-primary-muted-foreground',
  IMPORTANTE: 'bg-warning-muted text-warning',
  DESEJAVEL: 'bg-muted text-muted-foreground',
}

export function TabelaDeRequisitos({ requisitos }: { requisitos: Requisito[] }) {
  const { t } = useTranslation()

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-semibold">{t('slides.requisitos.colunas.id')}</th>
            <th className="py-2 pr-3 font-semibold">{t('slides.requisitos.colunas.requisito')}</th>
            <th className="py-2 pr-3 font-semibold max-sm:hidden">
              {t('slides.requisitos.colunas.prioridade')}
            </th>
            <th className="py-2 font-semibold">{t('slides.requisitos.colunas.status')}</th>
          </tr>
        </thead>
        <tbody>
          {requisitos.map(({ id, prioridade, status }) => (
            <tr key={id} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-3 align-top font-mono text-xs text-muted-foreground sm:text-sm">
                {id}
              </td>
              <td className="text-pretty py-2 pr-3 align-top text-sm leading-snug sm:text-base lg:text-lg">
                {t(`slides.requisitos.itens.${id}`)}
              </td>
              <td className="py-2 pr-3 align-top max-sm:hidden">
                <span
                  className={cn(
                    'inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold',
                    CORES[prioridade],
                  )}
                >
                  {t(`slides.requisitos.prioridade.${prioridade}`)}
                </span>
              </td>
              <td className="py-2 align-top">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold sm:text-sm',
                    status === 'PRONTO' ? 'text-income' : 'text-muted-foreground',
                  )}
                >
                  {status === 'PRONTO' ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <Clock className="size-4" aria-hidden />
                  )}
                  {t(`slides.requisitos.status.${status}`)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

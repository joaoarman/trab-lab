import { useTranslation } from 'react-i18next'
import { ArrowDownCircle, ArrowUpCircle, Check, FolderTree, Pencil, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import type { ReciboDeRegistro } from '@/shared/data/model'
import { formatDate, formatMoney, formatNumber } from '@/shared/i18n/format'

export function CartaoDeRegistro({ recibo }: { recibo: ReciboDeRegistro }) {
  const { t } = useTranslation()

  const { icone: Icone, cor, fundo, borda } = APARENCIA[recibo.tipo]
  const acao = ACOES[recibo.acao]
  const emDolar = recibo.moeda === 'USD' && recibo.cotacao != null

  return (
    <div className={cn('rounded-2xl border p-3', borda, fundo)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full',
            recibo.acao === 'excluido' || recibo.acao === 'desativado'
              ? 'bg-muted text-muted-foreground'
              : cn('bg-card', cor),
          )}
        >
          <acao.icone className="size-3.5" aria-hidden />
        </span>

        <span className={cn('flex items-center gap-1.5 text-sm font-semibold', cor)}>
          <Icone className="size-4 shrink-0" aria-hidden />
          {t(`chat.receipt.${recibo.tipo}.${recibo.acao}`)}
        </span>
      </div>

      <div className="mt-2.5 space-y-1.5">
        {recibo.valorEmBrl !== undefined && (
          <p className={cn('font-mono text-lg font-semibold leading-none', cor)}>
            {formatMoney(recibo.valorEmBrl)}
          </p>
        )}

        {emDolar && recibo.valor !== undefined && (
          <p className="font-mono text-xs text-muted-foreground">
            {t('chat.receipt.converted', {
              original: formatMoney(recibo.valor, recibo.moeda),
              rate: formatNumber(recibo.cotacao as number, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              }),
            })}
          </p>
        )}

        {recibo.valorEmBrl !== undefined && recibo.nome && (
          <p className="break-words text-sm text-foreground">{recibo.nome}</p>
        )}

        {recibo.categoria && recibo.categoria.length > 0 && (
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <FolderTree className="size-3.5 shrink-0" aria-hidden />
            {recibo.categoria.map((degrau, indice) => (
              <span key={`${degrau}-${indice}`} className="flex items-center gap-1">
                {indice > 0 && <span aria-hidden>›</span>}
                <span
                  className={cn(indice === recibo.categoria!.length - 1 && 'font-medium text-foreground')}
                >
                  {degrau}
                </span>
              </span>
            ))}

            {recibo.categoriaCriada && (
              <span className="rounded-full bg-warning-muted px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-warning">
                {t('chat.receipt.newCategory')}
              </span>
            )}
          </p>
        )}

        {recibo.tipo === 'gasto' && !recibo.categoria && (
          <p className="flex items-center gap-1 text-xs italic text-muted-foreground">
            <FolderTree className="size-3.5 shrink-0" aria-hidden />
            {t('chat.receipt.noCategory')}
          </p>
        )}
      </div>

      <dl className="mt-3 flex gap-1 border-t border-border/60 pt-2 text-[0.6875rem] text-muted-foreground">
        <dt>{t(ROTULO_DA_DATA[recibo.tipo])}</dt>
        <dd className="font-medium text-foreground/80">
          {dataHora(recibo.aconteceuEm ?? recibo.criadoEm)}
        </dd>
      </dl>
    </div>
  )
}

const ROTULO_DA_DATA: Record<ReciboDeRegistro['tipo'], string> = {
  gasto: 'chat.receipt.occurredAt',
  receita: 'chat.receipt.receivedAt',
  categoria: 'chat.receipt.createdAt',
}

function dataHora(iso: string): string {
  return formatDate(iso, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const APARENCIA: Record<ReciboDeRegistro['tipo'], {
  icone: LucideIcon
  cor: string
  fundo: string
  borda: string
}> = {
  gasto: {
    icone: ArrowDownCircle,
    cor: 'text-expense',
    fundo: 'bg-expense-muted',
    borda: 'border-expense/25',
  },
  receita: {
    icone: ArrowUpCircle,
    cor: 'text-income',
    fundo: 'bg-income-muted',
    borda: 'border-income/25',
  },
  categoria: {
    icone: FolderTree,
    cor: 'text-primary-muted-foreground',
    fundo: 'bg-primary-muted',
    borda: 'border-primary/25',
  },
}

const ACOES: Record<ReciboDeRegistro['acao'], { icone: LucideIcon }> = {
  criado: { icone: Check },
  editado: { icone: Pencil },
  excluido: { icone: Trash2 },
  desativado: { icone: Trash2 },
}

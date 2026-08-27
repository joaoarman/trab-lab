import { useTranslation } from 'react-i18next'

import { caminhoAte } from '@/shared/data/arvoreDeCategorias'
import type { Categoria, Lancamento } from '@/shared/data/model'
import { formatDate, formatMoney, formatNumber } from '@/shared/i18n/format'
import { cn } from '@/shared/lib/utils'
import { valorComSinal } from '../fatura'

const SEPARADOR = ' › '

export function LinhaDaFatura({
  lancamento,
  categorias,
}: {
  lancamento: Lancamento
  categorias: Categoria[]
}) {
  const { t } = useTranslation()

  const receita = lancamento.tipo === 'RECEITA'
  const caminho =
    lancamento.categoriaId === null ? [] : caminhoAte(categorias, lancamento.categoriaId)
  const folha = caminho[caminho.length - 1]
  const emOutraMoeda = lancamento.moeda !== 'BRL'

  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent">
      <span
        className={cn(
          'size-2.5 shrink-0 rounded-full',
          receita ? 'bg-income' : 'bg-muted-foreground/40',
        )}
        style={!receita && folha ? { backgroundColor: folha.cor } : undefined}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{lancamento.nome}</p>
        <p className="truncate text-xs text-muted-foreground">
          {receita
            ? t('statement.list.income')
            : folha
              ? caminho.map((categoria) => categoria.nome).join(SEPARADOR)
              : t('statement.list.noCategory')}
          {' · '}
          {formatDate(lancamento.aconteceuEm, { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            'font-mono text-sm font-semibold',
            receita ? 'text-income' : 'text-expense',
          )}
        >
          {formatMoney(valorComSinal(lancamento), 'BRL', { signDisplay: 'always' })}
        </p>
        {emOutraMoeda && lancamento.cotacao !== null && (
          <p className="font-mono text-xs text-muted-foreground">
            {formatMoney(lancamento.valor, lancamento.moeda)}
            {' · '}
            {formatNumber(lancamento.cotacao, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 4,
            })}
          </p>
        )}
      </div>
    </li>
  )
}

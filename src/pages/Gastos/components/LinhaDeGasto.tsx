import { useTranslation } from 'react-i18next'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import type { Categoria, Gasto } from '@/shared/data/model'
import { caminhoAte } from '@/shared/data/arvoreDeCategorias'
import { formatDate, formatMoney, formatNumber } from '@/shared/i18n/format'

const SEPARADOR = ' › '

export function LinhaDeGasto({
  gasto,
  categorias,
  onEditar,
  onRemover,
}: {
  gasto: Gasto
  categorias: Categoria[]
  onEditar: (gasto: Gasto) => void
  onRemover: (gasto: Gasto) => void
}) {
  const { t } = useTranslation()

  const caminho = gasto.categoriaId === null ? [] : caminhoAte(categorias, gasto.categoriaId)
  const folha = caminho[caminho.length - 1]
  const emOutraMoeda = gasto.moeda !== 'BRL'

  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent">
      <span
        className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40"
        style={folha ? { backgroundColor: folha.cor } : undefined}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{gasto.nome}</p>
        <p className="truncate text-xs text-muted-foreground">
          {folha ? caminho.map((categoria) => categoria.nome).join(SEPARADOR) : t('expenses.form.noCategory')}
          {' · '}
          {formatDate(gasto.ocorreuEm, { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold text-expense">
          {formatMoney(gasto.valorEmBrl)}
        </p>
        {emOutraMoeda && gasto.cotacao !== null && (
          <p className="font-mono text-xs text-muted-foreground">
            {formatMoney(gasto.valor, gasto.moeda)}
            {' · '}
            {formatNumber(gasto.cotacao, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </p>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={t('expenses.list.actions', { name: gasto.nome })}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEditar(gasto)}>
            <Pencil aria-hidden />
            {t('expenses.list.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onRemover(gasto)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 aria-hidden />
            {t('expenses.list.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

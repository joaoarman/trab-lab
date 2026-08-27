import { useTranslation } from 'react-i18next'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import type { Receita } from '@/shared/data/model'
import { formatDate, formatMoney, formatNumber } from '@/shared/i18n/format'

export function LinhaDeReceita({
  receita,
  onEditar,
  onRemover,
}: {
  receita: Receita
  onEditar: (receita: Receita) => void
  onRemover: (receita: Receita) => void
}) {
  const { t } = useTranslation()

  const emOutraMoeda = receita.moeda !== 'BRL'
  const mostrarRegistro = !mesmoDia(receita.recebidaEm, receita.registradaEm)

  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent">
      <span className="size-2.5 shrink-0 rounded-full bg-income" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{receita.nome}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatDate(receita.recebidaEm, { hour: '2-digit', minute: '2-digit' })}
          {mostrarRegistro && (
            <>
              {' · '}
              {t('income.list.registeredAt', {
                date: formatDate(receita.registradaEm, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                }),
              })}
            </>
          )}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold text-income">
          {formatMoney(receita.valorEmBrl)}
        </p>
        {emOutraMoeda && receita.cotacao !== null && (
          <p className="font-mono text-xs text-muted-foreground">
            {formatMoney(receita.valor, receita.moeda)}
            {' · '}
            {formatNumber(receita.cotacao, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </p>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={t('income.list.actions', { name: receita.nome })}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEditar(receita)}>
            <Pencil aria-hidden />
            {t('income.list.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onRemover(receita)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 aria-hidden />
            {t('income.list.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function mesmoDia(a: string, b: string): boolean {
  const primeira = new Date(a)
  const segunda = new Date(b)
  return (
    primeira.getFullYear() === segunda.getFullYear() &&
    primeira.getMonth() === segunda.getMonth() &&
    primeira.getDate() === segunda.getDate()
  )
}

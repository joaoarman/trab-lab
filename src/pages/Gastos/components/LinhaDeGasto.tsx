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

/**
 * Um gasto na lista.
 *
 * ## O que a linha diz, e em que ordem
 *
 * O nome primeiro (é por ele que a pessoa reconhece o episódio: "posto de
 * gasolina"), o caminho inteiro da categoria embaixo (`Carro › Gasolina` — só
 * "Gasolina" não diz de qual Carro quando há mais de uma), a hora à esquerda e o
 * valor à direita, em destaque.
 *
 * ## O valor em reais é o valor
 *
 * Mesmo num gasto em dólar, o número grande é o **valor em reais**: é a moeda em
 * que a pessoa pensa o próprio orçamento, e é o que soma no total do período logo
 * acima. O valor original e a cotação usada aparecem numa segunda linha, menor —
 * presentes para conferência, sem competir com o número que importa.
 *
 * A cor é `--expense` (o par semântico do tema), e **não** `--destructive`: um
 * gasto de R$ 20 no posto não é um erro nem um alerta, é o dia normal de quem
 * controla o dinheiro. O porquê está no cabeçalho do `src/theme.css`.
 *
 * ## Um gasto sem categoria não é um defeito
 *
 * "Sem categoria" aparece em cinza, sem alarme. É um estado previsto: quem acaba
 * de criar a conta registra o primeiro gasto antes de ter qualquer hierarquia, e
 * classifica depois.
 */
export function LinhaDeGasto({
  gasto,
  categorias,
  onEditar,
  onRemover,
}: {
  gasto: Gasto
  /** A lista plana completa — inclusive as desativadas, para o nome não sumir. */
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
      {/* A bolinha da cor da categoria: em lista longa, a cor é achada antes do
          nome. Cinza quando não há categoria — a linha continua alinhada com as
          vizinhas em vez de abrir um buraco. */}
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
            {/* A cotação é uma taxa, não um preço: vai como número puro, com as
                casas que o câmbio usa, e não passa por formatMoney — "R$ 5,16"
                aqui leria como se a pessoa tivesse gastado cinco reais. */}
            {formatNumber(gasto.cotacao, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </p>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* À vista, nunca só no hover: metade do uso deste sistema é no
              celular, onde hover não existe. O que a mantém discreta é a cor. */}
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

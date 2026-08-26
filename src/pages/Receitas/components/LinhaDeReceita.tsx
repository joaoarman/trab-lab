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

/**
 * Uma receita na lista.
 *
 * ## O que a linha diz, e em que ordem
 *
 * O nome primeiro (é por ele que a pessoa reconhece de onde veio: "salário",
 * "freela do site"), as duas datas embaixo, e o valor à direita, em destaque.
 *
 * ## As duas datas, e por que as duas
 *
 * `recebidaEm` é a hora em que o dinheiro entrou — é ela que ordena e agrupa a
 * lista, e por isso o cabeçalho do dia já diz a data: aqui basta a **hora**.
 * `registradaEm` é quando a linha foi criada no sistema, e vem depois, com a data
 * inteira.
 *
 * As duas juntas respondem a uma pergunta que uma só não responde: "isto está
 * lançado desde quando?". Numa lista em que o mês é conferido de uma vez, saber
 * que o aluguel de dia 5 só foi registrado no dia 20 explica por que o total
 * parecia menor até ontem.
 *
 * **Quando as duas caem no mesmo dia, a segunda some.** Repetir "recebida
 * 26/08 · registrada 26/08" não informa nada e rouba a linha inteira do nome —
 * e o caso comum é justamente esse: registrar o que acabou de cair.
 *
 * ## O valor em reais é o valor
 *
 * Mesmo numa receita em dólar, o número grande é o **valor em reais**: é a moeda
 * em que a pessoa pensa o próprio orçamento, e é o que soma no total do período
 * logo acima. O valor original e a cotação usada aparecem numa segunda linha,
 * menor — presentes para conferência, sem competir com o número que importa.
 *
 * A cor é `--income` (o par semântico do tema), e nunca `--primary`: dinheiro que
 * entra tem cor própria, separada da cor de "clicar aqui". O porquê está no
 * cabeçalho do `src/theme.css`.
 */
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
      {/* A bolinha na cor de receita: alinha esta lista com a de Gastos (onde ela
          carrega a cor da categoria) e marca, de relance, de que lado do dinheiro
          a linha está. */}
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
            {/* A cotação é uma taxa, não um preço: vai como número puro, com as
                casas que o câmbio usa, e não passa por formatMoney — "R$ 5,16"
                aqui leria como se a pessoa tivesse recebido cinco reais. */}
            {formatNumber(receita.cotacao, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
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

/**
 * As duas datas caem no mesmo dia do calendário de quem está olhando?
 *
 * Compara os componentes **locais**, e não `.slice(0, 10)` das strings: elas vêm
 * em UTC, e uma receita recebida às 22h em Brasília e registrada às 22h05 tem
 * duas datas ISO diferentes — a tela mostraria "registrada em" no caso em que
 * ela justamente não tem nada a acrescentar.
 */
function mesmoDia(a: string, b: string): boolean {
  const primeira = new Date(a)
  const segunda = new Date(b)
  return (
    primeira.getFullYear() === segunda.getFullYear() &&
    primeira.getMonth() === segunda.getMonth() &&
    primeira.getDate() === segunda.getDate()
  )
}

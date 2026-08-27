import { useTranslation } from 'react-i18next'
import { ArrowDownToLine, ArrowUpFromLine, Coins, MessagesSquare } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card } from '@/shared/components/ui/card'
import type { ConsumoDeIA } from '@/shared/data/model'
import { formatNumber } from '@/shared/i18n/format'
import { custoDeIA } from './custo'

/**
 * O consumo do período — a resposta de "quanto isso custou?".
 *
 * É metade da razão de existir do módulo (a outra é "o que a IA fez com a minha
 * mensagem?", que é a lista abaixo). Fica no **topo**, antes da lista, porque é a
 * pergunta que traz a pessoa até aqui: ela abre o Log para ver a conta, não para
 * reler a conversa.
 *
 * ## Quatro números, e por que nenhum sobra
 *
 * O **custo** sozinho não diz nada: US$ 0,42 é muito ou pouco? As **mensagens**
 * dão a escala (0,42 em 300 mensagens é diferente de 0,42 em 3), e os **tokens**
 * dizem para onde o dinheiro foi — entrada alta é prompt grande (a árvore de
 * categorias, o histórico), saída alta é resposta longa. Sem essa quebra, quando a
 * conta subir não haverá como saber o que mudou.
 *
 * A entrada vem antes da saída porque, neste sistema, é ela que domina: o system
 * prompt e o histórico viajam inteiros a cada mensagem.
 *
 * ## O total inclui o que foi limpo da conversa
 *
 * `chat_clear` marca `is_active = false`, e a RPC de totais soma tudo — limpar a
 * conversa não apaga o custo já pago à OpenAI. Fosse o contrário, quem mais usa o
 * chat teria o consumo subdeclarado justamente por organizar a tela.
 */
export function TotaisDeConsumo({
  consumo,
  carregando,
}: {
  consumo: ConsumoDeIA | null
  carregando: boolean
}) {
  const { t } = useTranslation()

  const itens: { chave: string; icone: LucideIcon; valor: string; destaque?: boolean }[] = [
    {
      chave: 'cost',
      icone: Coins,
      valor: consumo ? custoDeIA(consumo.custoEmCentavosDeDolar, 'total') : '—',
      // O custo é o número que a pessoa veio ver: fonte maior e cor de texto
      // cheia, enquanto os outros três ficam em `muted`.
      destaque: true,
    },
    {
      chave: 'messages',
      icone: MessagesSquare,
      valor: consumo ? formatNumber(consumo.mensagens) : '—',
    },
    {
      chave: 'tokensIn',
      icone: ArrowDownToLine,
      valor: consumo ? formatNumber(consumo.tokensEntrada) : '—',
    },
    {
      chave: 'tokensOut',
      icone: ArrowUpFromLine,
      valor: consumo ? formatNumber(consumo.tokensSaida) : '—',
    },
  ]

  return (
    // Duas colunas no celular e quatro a partir do tablet: quatro números numa
    // coluna só empurrariam a lista para fora da primeira tela do telefone, e é a
    // lista que ocupa o resto da página.
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {itens.map((item) => (
        <Card key={item.chave} className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <item.icone className="size-3.5 shrink-0" aria-hidden />
            {t(`log.totals.${item.chave}`)}
          </p>
          <p
            className={
              item.destaque
                ? 'mt-1.5 font-mono text-xl font-semibold text-foreground'
                : 'mt-1.5 font-mono text-lg font-medium text-foreground'
            }
          >
            {/* Enquanto carrega, o traço fica: um esqueleto animado num bloco de
                quatro números pisca mais do que informa, e o valor chega rápido. */}
            {carregando ? '—' : item.valor}
          </p>
        </Card>
      ))}
    </div>
  )
}

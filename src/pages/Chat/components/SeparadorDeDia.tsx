import { useTranslation } from 'react-i18next'

import { formatDate } from '@/shared/i18n/format'
import { dataLocal, deslocarData } from '@/shared/utils/datas'

/**
 * A etiqueta de data da conversa — "Hoje", "Ontem", "31/07/2026".
 *
 * Numa conversa contínua que nunca é arquivada, é o que impede a mensagem de três
 * semanas atrás de parecer a de agora. Só o horário na bolha não resolve: "19:07"
 * é igual em qualquer dia — e neste sistema a diferença importa, porque a conversa
 * é o extrato.
 *
 * Hoje e ontem vêm por nome porque é assim que se fala deles; do antepenúltimo dia
 * em diante, a data em números responde mais rápido do que "há 12 dias".
 *
 * ## Ela GRUDA no topo enquanto o dia passa
 *
 * `sticky` dentro do bloco daquele dia (o `<section>` que a `ChatPage` monta): a
 * etiqueta acompanha a rolagem até a última mensagem do dia sair da tela, e aí o
 * dia seguinte a empurra para cima e assume o lugar. É o comportamento de qualquer
 * aplicativo de mensagem, e ele existe para responder "de quando é isto?" no meio
 * de uma rolagem longa, sem obrigar a subir até o começo do dia.
 *
 * Duas consequências no desenho, e as duas importam:
 *
 * - ela **flutua sobre as mensagens** (`z-10`), então precisa de fundo próprio e
 *   opaco — daí o `bg-card` com borda. Uma etiqueta translúcida deixaria o texto
 *   da bolha aparecer por trás e as duas coisas ficariam ilegíveis;
 * - ela **não recebe clique** (`pointer-events-none`): enquanto flutua, cobre um
 *   pedaço da bolha que passa por baixo, e um alvo invisível ali roubaria o toque
 *   de quem quisesse selecionar aquele texto.
 */
export function SeparadorDeDia({ dia }: { dia: string }) {
  const { t } = useTranslation()

  const hoje = dataLocal()
  const rotulo =
    dia === hoje
      ? t('chat.day.today')
      : dia === deslocarData(hoje, -1)
        ? t('chat.day.yesterday')
        : formatDate(meiaNoiteLocal(dia), { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="pointer-events-none sticky top-1 z-10 flex justify-center">
      <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
        {rotulo}
      </span>
    </div>
  )
}

/**
 * `2026-08-26` → a meia-noite daquele dia, **no fuso local**.
 *
 * `new Date('2026-08-26')` leria a string como UTC, e em Brasília o rótulo sairia
 * com o dia anterior — a etiqueta diria "25/08" sobre as mensagens do dia 26.
 */
function meiaNoiteLocal(dia: string): Date {
  const [ano, mes, data] = dia.split('-').map(Number)
  return new Date(ano, mes - 1, data)
}

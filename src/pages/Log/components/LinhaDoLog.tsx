import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, ChevronDown, EyeOff, Mic, Sparkles, UserRound, Wrench } from 'lucide-react'

import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible'
import { rotuloDoDia } from '@/shared/data/extrato'
import { cn } from '@/shared/lib/utils'
import type { MensagemDaIA } from '@/shared/data/model'
import { formatNumber } from '@/shared/i18n/format'
import { custoDeIA } from './custo'

/**
 * Uma linha do log — uma mensagem, com tudo o que ela custou e tudo o que ela fez.
 *
 * ## Por que a auditoria é dobrável, e não uma tabela
 *
 * A pergunta comum ("o que aconteceu neste dia?") se responde com o texto da
 * mensagem e o custo; a pergunta rara ("por que ESTA mensagem custou tanto?") pede
 * os argumentos crus que a IA mandou para cada ferramenta. Uma tabela com colunas
 * para tudo tornaria a pergunta comum ilegível para servir à rara. Aqui o resumo
 * fica sempre visível e o detalhe abre no clique — e só nas linhas em que houve
 * ferramenta, porque nas outras não há o que abrir.
 *
 * ## Os argumentos vão CRUS, como JSON
 *
 * É o ponto da auditoria: o que se quer ver é exatamente o que o modelo pediu, com
 * os nomes de campo dele. Formatar isso numa frase bonita ("registrou R$ 20 em
 * Carro › Gasolina") apagaria a diferença entre o que ele pediu e o que o banco
 * gravou — e é justamente essa diferença que se vai procurar aqui quando algo
 * parecer errado.
 *
 * ## A marca de "fora da conversa"
 *
 * Uma mensagem limpa pelo botão do Chat continua aqui, com o custo somando no
 * total. A etiqueta diz isso, porque sem ela a pessoa procuraria essa mensagem na
 * conversa e não a acharia — e concluiria que o log está mostrando algo que não
 * existe.
 */
export function LinhaDoLog({ mensagem }: { mensagem: MensagemDaIA }) {
  const { t, i18n } = useTranslation()
  const [aberta, setAberta] = useState(false)

  const doUsuario = mensagem.papel === 'USER'
  const recusa = mensagem.tipo === 'REFUSAL'
  const temDetalhe = mensagem.ferramentas.length > 0

  const horario = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(mensagem.criadaEm))

  return (
    <li
      className={cn(
        'rounded-lg border border-border bg-card p-3',
        // A recusa fica marcada aqui também, pela mesma razão de ficar no Chat:
        // ela é o único desfecho em que o pedido do usuário não foi atendido, e
        // procurar por esses casos é um uso legítimo desta tela.
        recusa && 'border-destructive/30 bg-destructive-muted/40',
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {/* Quem falou, em ícone: numa lista longa, dois símbolos alternando são
            mais rápidos de varrer do que duas palavras. */}
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full',
            doUsuario
              ? 'bg-secondary text-secondary-foreground'
              : recusa
                ? 'bg-destructive-muted text-destructive'
                : 'bg-primary-muted text-primary-muted-foreground',
          )}
        >
          {doUsuario ? (
            <UserRound className="size-3.5" />
          ) : recusa ? (
            <Ban className="size-3.5" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">
            {mensagem.conteudo}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
            <span className="sr-only">
              {t(doUsuario ? 'log.entry.fromUser' : 'log.entry.fromAssistant')}
            </span>
            <time dateTime={mensagem.criadaEm}>{horario}</time>

            {mensagem.origem === 'AUDIO' && (
              <Badge variant="outline" className="gap-1 font-normal">
                <Mic className="size-3" aria-hidden />
                {t('log.entry.audio')}
              </Badge>
            )}

            {!mensagem.naConversa && (
              <Badge variant="outline" className="gap-1 font-normal">
                <EyeOff className="size-3" aria-hidden />
                {t('log.entry.cleared')}
              </Badge>
            )}

            {/* O modelo vem gravado na linha, não da constante atual: uma troca de
                modelo não pode reescrever o que o passado custou. */}
            {mensagem.modelo && (
              <Badge variant="secondary" className="font-mono font-normal">
                {mensagem.modelo}
              </Badge>
            )}
          </div>
        </div>

        {/* O extrato à direita no desktop, embaixo no celular. `ml-auto` +
            `text-right` mantêm os números alinhados entre linhas de alturas
            diferentes, que é o que permite varrer a coluna de custo de relance. */}
        <div className="ml-auto shrink-0 text-right">
          <p className="font-mono text-sm font-medium text-foreground">
            {/* Null NÃO é zero: uma mensagem digitada não chamou IA nenhuma, e
                escrever "US$ 0,00" ali diria que ela saiu de graça — quando a
                verdade é que não houve chamada. O travessão diz isso. */}
            {mensagem.custoEmCentavosDeDolar === null
              ? '—'
              : custoDeIA(mensagem.custoEmCentavosDeDolar, 'linha')}
          </p>
          {(mensagem.tokensEntrada !== null || mensagem.tokensSaida !== null) && (
            <p className="mt-0.5 font-mono text-[0.6875rem] text-muted-foreground">
              {t('log.entry.tokens', {
                input: formatNumber(mensagem.tokensEntrada ?? 0),
                output: formatNumber(mensagem.tokensSaida ?? 0),
              })}
              {/* O cacheado é um PEDAÇO da entrada, não um extra a somar — por
                  isso entre parênteses, e só quando houve. É ele que explica uma
                  entrada grande custando pouco. */}
              {mensagem.tokensEntradaCacheados ? (
                <span className="ml-1">
                  {t('log.entry.cached', {
                    value: formatNumber(mensagem.tokensEntradaCacheados),
                  })}
                </span>
              ) : null}
            </p>
          )}
        </div>
      </div>

      {temDetalhe && (
        <Collapsible open={aberta} onOpenChange={setAberta} className="mt-2">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
            >
              <Wrench className="size-3.5" aria-hidden />
              {t('log.entry.tools', { count: mensagem.ferramentas.length })}
              <ChevronDown
                className={cn('size-3.5 transition-transform', aberta && 'rotate-180')}
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <ul className="mt-2 space-y-2">
              {mensagem.ferramentas.map((ferramenta, indice) => (
                <li
                  key={`${ferramenta.nome}-${indice}`}
                  className="rounded-md border border-border bg-muted/40 p-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-xs font-medium text-foreground">
                      {ferramenta.nome}
                    </code>
                    <Badge
                      variant={ferramenta.ok ? 'secondary' : 'destructive'}
                      className="font-normal"
                    >
                      {t(ferramenta.ok ? 'log.entry.toolOk' : 'log.entry.toolFailed')}
                    </Badge>
                  </div>

                  {/* A frase de erro é a MESMA que voltou para o modelo. É por ela
                      que se entende uma rodada extra: ele errou o argumento, leu
                      isto e tentou de novo — e as duas idas estão no custo. */}
                  {ferramenta.erro && (
                    <p className="mt-1.5 text-xs text-destructive">{ferramenta.erro}</p>
                  )}

                  {/* `overflow-x-auto`: JSON não quebra linha sozinho, e sem isto
                      um argumento longo esticaria a página inteira no celular. */}
                  <pre className="mt-1.5 overflow-x-auto rounded bg-background p-2 font-mono text-[0.6875rem] leading-relaxed text-muted-foreground">
                    {JSON.stringify(ferramenta.argumentos, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </li>
  )
}

/**
 * O cabeçalho de um dia da lista.
 *
 * Usa `rotuloDoDia` de `shared/data/extrato.ts` — o MESMO rótulo dos extratos de
 * Gastos e Receitas. É de propósito: as três telas listam coisas por dia, e um
 * formato de data diferente em cada uma faria o app parecer três apps.
 *
 * (O separador do Chat é o único que foge, e ele foge por um motivo: numa conversa
 * "Hoje" e "Ontem" se leem melhor que a data por extenso.)
 */
export function DiaDoLog({ data, children }: { data: string; children: ReactNode }) {
  return (
    <section className="space-y-2" aria-label={rotuloDoDia(data)}>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {rotuloDoDia(data)}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}

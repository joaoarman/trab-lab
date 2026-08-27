import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, ScrollText, TriangleAlert } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { FiltroDePeriodo } from '@/shared/components/FiltroDePeriodo'
import type { ConsumoDeIA, MensagemDaIA, RecorteDePeriodo } from '@/shared/data/model'
import { dataLocal, periodoDe, type Atalho, type PeriodoEscolhido } from '@/shared/utils/datas'
import { consumoDoPeriodo, listarMensagens, TAMANHO_DA_PAGINA } from './supabase'
import { DiaDoLog, LinhaDoLog } from './components/LinhaDoLog'
import { TotaisDeConsumo } from './components/TotaisDeConsumo'

/** O recorte com que a tela abre: o mês corrente — ver `shared/utils/datas.ts`. */
const ATALHO_INICIAL: Atalho = 'esteMes'

/**
 * Log da IA — `/ai-log`.
 *
 * É o que torna a parte de IA deste sistema **auditável**. Sem ele, o Chat seria
 * uma caixa-preta que gasta dinheiro: dá para ver o que a IA respondeu, mas não o
 * que ela chamou por baixo nem quanto aquilo custou.
 *
 * ## As duas perguntas, na ordem em que se fazem
 *
 * 1. **"quanto isso custou?"** — os totais, no topo. É o que traz a pessoa aqui;
 * 2. **"o que a IA fez com a minha mensagem?"** — a lista, abaixo, com o texto de
 *    cada mensagem e, dobrado, as ferramentas que rodaram com os argumentos crus.
 *
 * ## Por que a lista mostra o que o usuário LIMPOU da conversa
 *
 * "Limpar conversa", no Chat, é `is_active = false` — nunca delete. As mensagens
 * somem de lá e continuam aqui, marcadas. É o desenho do módulo: se limpar a
 * conversa apagasse as linhas, a única prestação de contas de quanto a IA custou
 * iria junto, e quem mais usa o chat teria o consumo subdeclarado justamente por
 * organizar a tela.
 *
 * ## Esta tela é só leitura, e por dentro também
 *
 * Não há botão de editar nem de apagar, e não é por falta de tela: **não existe
 * grant** de escrita em `public.ai_log` para o cliente. Um log que a pessoa
 * auditada consegue mexer não audita nada.
 *
 * ## Os totais não saem da lista
 *
 * A lista é paginada; o rodapé de totais vem de uma RPC que soma no banco (ver
 * `./supabase.ts`). Somar a página visível daria um número menor que a verdade,
 * com cara de resposta certa — o defeito que uma tela de auditoria menos pode ter.
 */
export function LogPage() {
  const { t } = useTranslation()

  const [mensagens, setMensagens] = useState<MensagemDaIA[]>([])
  const [consumo, setConsumo] = useState<ConsumoDeIA | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [temMais, setTemMais] = useState(false)
  const [erro, setErro] = useState(false)

  const [periodo, setPeriodo] = useState<PeriodoEscolhido>(ATALHO_INICIAL)
  const [recorte, setRecorte] = useState<RecorteDePeriodo>(() => periodoDe(ATALHO_INICIAL))

  /**
   * A lista e os totais são buscados JUNTOS, e sempre os dois.
   *
   * Eles respondem sobre o mesmo recorte, e deixar um deles para trás numa troca
   * de filtro mostraria o custo de agosto sobre a lista de julho — o pior erro
   * possível numa tela cuja função é conferir números.
   */
  const recarregar = useCallback(async () => {
    setErro(false)
    setCarregando(true)
    try {
      const [pagina, totais] = await Promise.all([
        listarMensagens(recorte),
        consumoDoPeriodo(recorte),
      ])
      setMensagens(pagina)
      setConsumo(totais)
      // Página cheia = provavelmente há mais. Uma página incompleta encerra o
      // assunto sem uma segunda consulta.
      setTemMais(pagina.length === TAMANHO_DA_PAGINA)
    } catch {
      setErro(true)
    } finally {
      setCarregando(false)
    }
  }, [recorte])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  async function carregarMais() {
    const ultima = mensagens[mensagens.length - 1]
    if (!ultima || carregandoMais) return

    setCarregandoMais(true)
    try {
      const proximas = await listarMensagens(recorte, ultima.id)
      setMensagens((atuais) => [...atuais, ...proximas])
      setTemMais(proximas.length === TAMANHO_DA_PAGINA)
    } catch {
      setErro(true)
    } finally {
      setCarregandoMais(false)
    }
  }

  /**
   * As mensagens fatiadas por dia, **no fuso de quem está olhando**.
   *
   * A lista já vem ordenada do banco (mais recente primeiro), então o dia corrente
   * é sempre o último grupo criado: basta olhar o fim, sem Map nem reordenação.
   *
   * Não usa `agruparPorDia` de `shared/data/extrato.ts` porque aquela função existe
   * para somar o dia — ela pede um acessor de valor, e aqui não há total por dia:
   * o custo se lê no período inteiro, no topo, e por mensagem, na linha.
   */
  const dias = useMemo(() => {
    const grupos: { data: string; mensagens: MensagemDaIA[] }[] = []

    for (const mensagem of mensagens) {
      const data = dataLocal(mensagem.criadaEm)
      const ultimo = grupos[grupos.length - 1]
      if (ultimo?.data === data) ultimo.mensagens.push(mensagem)
      else grupos.push({ data, mensagens: [mensagem] })
    }

    return grupos
  }, [mensagens])

  return (
    // Sem título aqui: quem escreve "Log da IA" no topo é o header, a partir de
    // `navigation.ts`. Repeti-lo daria dois <h1> na mesma tela.
    <div className="space-y-6">
      {erro && (
        <Alert variant="destructive" className="justify-between">
          <span className="flex items-center gap-2">
            <TriangleAlert aria-hidden />
            {t('log.page.loadFailed')}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void recarregar()}>
            {t('log.page.retry')}
          </Button>
        </Alert>
      )}

      <Card>
        <CardContent className="p-4">
          {/* O MESMO filtro de Gastos e Receitas: as três telas fazem a mesma
              pergunta ("de quando até quando?"), e um controle diferente em cada
              uma faria o usuário reaprender o recorte a cada tela. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <FiltroDePeriodo
              recorte={recorte}
              onRecorte={setRecorte}
              periodo={periodo}
              onPeriodo={setPeriodo}
              desabilitado={carregando}
            />
          </div>
        </CardContent>
      </Card>

      <TotaisDeConsumo consumo={consumo} carregando={carregando} />

      <Card>
        <CardContent className="p-4">
          {carregando ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : mensagens.length === 0 ? (
            <EstadoVazio />
          ) : (
            <div className="space-y-5">
              {dias.map((dia) => (
                <DiaDoLog key={dia.data} data={dia.data}>
                  {dia.mensagens.map((mensagem) => (
                    <LinhaDoLog key={mensagem.id} mensagem={mensagem} />
                  ))}
                </DiaDoLog>
              ))}

              {temMais && (
                <div className="flex justify-center pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={carregandoMais}
                    onClick={() => void carregarMais()}
                  >
                    {carregandoMais && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {t('log.page.loadMore')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * O estado vazio.
 *
 * Não oferece ação nenhuma, e é de propósito: nada se cria a partir daqui. O que
 * ele faz é dizer **onde** o log nasce — na conversa —, porque um "nenhum registro
 * neste período" sozinho deixaria a pessoa achando que a tela está quebrada.
 */
function EstadoVazio() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <ScrollText className="size-6" aria-hidden />
      </span>
      <p className="font-display text-base font-medium">{t('log.empty.title')}</p>
      <p className="max-w-prose text-sm text-muted-foreground">{t('log.empty.description')}</p>
    </div>
  )
}

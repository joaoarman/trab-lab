import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import type { Moeda } from '@/shared/data/model'
import { formatMoney } from '@/shared/i18n/format'
import { buscarCotacao, MOEDAS } from '@/shared/lib/cotacao'
import { cn } from '@/shared/lib/utils'

/**
 * Quanto foi, em que moeda e por qual cotação — o bloco de dinheiro dos
 * formulários de lançamento.
 *
 * ## Por que é compartilhado
 *
 * Registrar um gasto e registrar uma receita fazem a mesma pergunta sobre o
 * dinheiro, com as mesmas regras: o valor aceita vírgula, a moeda é um par de
 * botões, a cotação é buscada ao trocar para US$ e continua editável, e a prévia
 * em reais aparece embaixo. Duplicar isso seria duplicar quatro estados, a
 * chamada à API de câmbio, a validação e sete chaves de i18n em dois arquivos —
 * que divergem no dia em que alguém corrigir um só. O Chat vai precisar do mesmo
 * bloco quando o cartão de confirmação virar editável.
 *
 * Fica solto em `shared/components/` porque atravessa módulos e não é primitivo
 * de UI nem layout — a mesma prateleira de `PerfilAvatar` e `FiltroDePeriodo`.
 *
 * ## O estado dos campos é de quem chama; a busca da cotação é daqui
 *
 * Os três campos são **controlados**: o formulário guarda os textos e decide com
 * o que abrir (um lançamento novo abre vazio, um em edição abre com o que está
 * salvo). O que mora aqui dentro é o **comportamento** — trocar para US$ dispara
 * a busca, voltar para R$ limpa a cotação, o botão de recarregar busca de novo.
 *
 * Isso é o que garante a regra mais importante do bloco: **editar não
 * reprecifica**. A busca acontece no gesto de trocar a moeda, e nunca num
 * `useEffect` de montagem — corrigir o nome de um lançamento de março não pode
 * reavaliá-lo pela cotação de hoje. Quem quiser atualizar clica no botão de
 * recarregar, e aí é escolha, não efeito colateral.
 *
 * ## O campo de cotação fica à vista
 *
 * Não está escondido atrás de um "avançado", por dois motivos: a pessoa precisa
 * **ver** por qual taxa o lançamento dela está sendo convertido antes de salvar,
 * e a API é de terceiro — quando ela não responde, o mesmo campo já é o plano B,
 * sem nenhuma tela nova. Registrar não pode depender de um serviço externo estar
 * de pé.
 *
 * ## Quem converte de verdade é o banco
 *
 * A prévia em reais mostrada aqui é só isso: uma prévia. `amount_brl` é calculado
 * pelas triggers `expense_guard`/`income_guard`, e o cliente sequer tem grant na
 * coluna. Se a conta valesse a daqui, bastaria uma aba antiga aberta para o
 * extrato passar a mentir.
 */
export function EntradaDeValor({
  id,
  valor,
  onValor,
  moeda,
  onMoeda,
  cotacao,
  onCotacao,
  /** A leitura numérica de `valor`, que o formulário já calcula para validar. */
  valorEmReais,
  desabilitado,
}: {
  /** Prefixo dos `id` dos campos — o formulário garante que seja único na tela. */
  id: string
  valor: string
  onValor: (valor: string) => void
  moeda: Moeda
  onMoeda: (moeda: Moeda) => void
  cotacao: string
  onCotacao: (cotacao: string) => void
  valorEmReais: number | null
  desabilitado: boolean
}) {
  const { t } = useTranslation()

  const [buscando, setBuscando] = useState(false)
  const [falhou, setFalhou] = useState(false)

  /** Busca a cotação do momento e preenche o campo. */
  async function atualizarCotacao(daMoeda: Moeda) {
    setBuscando(true)
    setFalhou(false)
    const buscada = await buscarCotacao(daMoeda)
    setBuscando(false)

    if (buscada === null) setFalhou(true)
    else onCotacao(String(buscada))
  }

  function trocarMoeda(nova: Moeda) {
    onMoeda(nova)
    if (nova === 'BRL') {
      // Some com a cotação junto com o campo: mantê-la guardada faria o valor
      // reaparecer se a pessoa voltasse para US$, com uma taxa que ela já viu
      // sumir da tela.
      onCotacao('')
      setFalhou(false)
      return
    }
    void atualizarCotacao(nova)
  }

  const numeroDaCotacao = numeroDeCotacao(cotacao)

  /**
   * A prévia em reais. O cálculo definitivo é do banco — ver o cabeçalho.
   *
   * O `round` para o centavo repete o `round(x, 2)` das triggers: sem ele a
   * prévia mostraria R$ 258,0100000000000005 num caso e o valor salvo em outro, e
   * a pessoa veria dois números diferentes para o mesmo lançamento.
   */
  const previaEmBrl =
    valorEmReais !== null && moeda !== 'BRL' && numeroDaCotacao !== null
      ? Math.round(valorEmReais * numeroDaCotacao * 100) / 100
      : null

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${id}-valor`}>{t('money.amount')}</Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-valor`}
            // `inputMode="decimal"` e não `type="number"`: o teclado do celular
            // abre com os números, mas o campo continua sendo texto —
            // `type="number"` recusa a vírgula em boa parte dos navegadores, e é
            // ela que quem digita em português usa. Quem lê os dois separadores é
            // `reaisDeTexto` (`shared/utils/dinheiro.ts`).
            inputMode="decimal"
            placeholder={t('money.amountPlaceholder')}
            // `min-w-0` porque o campo divide a linha com o seletor de moeda: um
            // <input> tem largura intrínseca (~20 caracteres) e o `min-width:
            // auto` do flex o impede de encolher abaixo dela — sem isto a linha
            // estoura para fora da modal num celular estreito.
            className="min-w-0 font-mono"
            value={valor}
            onChange={(evento) => onValor(evento.target.value)}
            disabled={desabilitado}
          />
          <SeletorDeMoeda valor={moeda} onValor={trocarMoeda} desabilitado={desabilitado} />
        </div>
      </div>

      {moeda !== 'BRL' && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-cotacao`}>{t('money.rate', { currency: moeda })}</Label>
          <div className="flex gap-2">
            <Input
              id={`${id}-cotacao`}
              inputMode="decimal"
              className="min-w-0 font-mono"
              value={cotacao}
              onChange={(evento) => {
                onCotacao(evento.target.value)
                setFalhou(false)
              }}
              disabled={desabilitado || buscando}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => void atualizarCotacao(moeda)}
              disabled={desabilitado || buscando}
              aria-label={t('money.refreshRate')}
            >
              {buscando ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
            </Button>
          </div>

          {falhou && (
            <Alert variant="warning">
              <TriangleAlert aria-hidden />
              {t('money.rateFailed')}
            </Alert>
          )}

          {previaEmBrl !== null && (
            <p className="text-xs text-muted-foreground">
              {t('money.preview', { value: formatMoney(previaEmBrl) })}
            </p>
          )}
        </div>
      )}
    </>
  )
}

/**
 * O texto do campo de cotação → o número, ou `null` se não der para ler um.
 *
 * Exportada porque o formulário precisa do **mesmo** número que a prévia usou:
 * é ele que valida o botão de salvar e é ele que vai para o banco. Recalcular a
 * leitura em cada tela abriria a porta para a prévia dizer uma coisa e o registro
 * gravar outra.
 *
 * A vírgula é trocada por ponto porque o campo aceita as duas — quem digita em
 * português escreve `5,16`. Diferente do valor, a cotação não tem separador de
 * milhar a desfazer: nenhuma moeda vale mil reais a unidade.
 */
export function numeroDeCotacao(texto: string): number | null {
  const numero = Number(texto.replace(',', '.'))
  return Number.isFinite(numero) && numero > 0 ? numero : null
}

/**
 * A moeda, como um par de botões colados — e não como uma lista suspensa.
 *
 * São duas opções e elas ficam **as duas à vista**: trocar para US$ é um toque,
 * contra dois de um `<select>` (abrir, escolher). Num campo que fica ao lado do
 * valor, ver a moeda ativa sem abrir nada também evita registrar em dólar por
 * engano.
 *
 * Deriva do `Button` do projeto, como manda a regra 7 — o visual de "segmentado"
 * é só o arredondamento das pontas e o `-ml-px` que sobrepõe as bordas.
 */
function SeletorDeMoeda({
  valor,
  onValor,
  desabilitado,
}: {
  valor: Moeda
  onValor: (moeda: Moeda) => void
  desabilitado: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="flex shrink-0" role="group" aria-label={t('money.currency')}>
      {MOEDAS.map(({ codigo, simbolo }, indice) => (
        <Button
          key={codigo}
          type="button"
          variant={valor === codigo ? 'default' : 'outline'}
          onClick={() => onValor(codigo)}
          disabled={desabilitado}
          aria-pressed={valor === codigo}
          className={cn(
            'px-3 font-mono',
            indice > 0 && '-ml-px rounded-l-none',
            indice < MOEDAS.length - 1 && 'rounded-r-none',
            // O selecionado sobe uma camada: sem isso, a borda do vizinho
            // apagaria o lado dele que está por baixo.
            valor === codigo && 'relative z-10',
          )}
        >
          {simbolo}
        </Button>
      ))}
    </div>
  )
}

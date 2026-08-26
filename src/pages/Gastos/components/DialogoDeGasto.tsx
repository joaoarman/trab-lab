import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { toast } from '@/shared/components/ui/sonner'
import type { Categoria, Gasto, Moeda } from '@/shared/data/model'
import { formatMoney } from '@/shared/i18n/format'
import { buscarCotacao, MOEDAS } from '@/shared/lib/cotacao'
import { cn } from '@/shared/lib/utils'
import { reaisDeTexto, textoDeValor, VALOR_MAXIMO, VALOR_MINIMO } from '@/shared/utils/dinheiro'
import { chaveDeErroDeGasto, criarGasto, salvarGasto } from '../supabase'
import { SeletorDeCategoria } from './SeletorDeCategoria'

/** O tamanho da coluna `name` no banco (`expense_name_len`). */
const MAX_DO_NOME = 80

/**
 * Registrar e editar um gasto — uma modal só.
 *
 * São o mesmo formulário porque são os mesmos campos, e separá-los duplicaria a
 * validação, a conversão e o tratamento de erro para ganhar um título diferente.
 *
 * ## A cotação é buscada sozinha, mas continua editável
 *
 * Escolher **US$** dispara a busca da cotação do momento (`shared/lib/cotacao.ts`)
 * e preenche o campo. O campo fica visível, e não escondido atrás de um "avançado",
 * por dois motivos: a pessoa precisa **ver** por qual taxa o gasto dela está sendo
 * convertido antes de salvar, e a API é de terceiro — quando ela não responde, o
 * mesmo campo já é o plano B, sem nenhuma tela nova. Registrar não pode depender
 * de um serviço externo estar de pé.
 *
 * **Ao EDITAR, a cotação não é rebuscada.** A taxa guardada é um fato datado: o
 * gasto de março valeu o dólar de março. Corrigir o nome de um gasto antigo não
 * pode reprecificá-lo pela cotação de hoje — quem quiser atualizar clica no botão
 * de recarregar, e aí é uma escolha, não um efeito colateral.
 *
 * ## Quem converte é o banco
 *
 * A prévia em reais mostrada aqui é só isso: uma prévia. `amount_brl` é
 * calculado pela trigger `expense_guard`, e o cliente sequer tem grant na coluna.
 * Se a conta valesse a daqui, bastaria uma aba antiga aberta para o extrato passar
 * a mentir. Ver o cabeçalho de `../supabase.ts`.
 */
export function DialogoDeGasto({
  alvo,
  categorias,
  onFechar,
  onSalvo,
}: {
  /** `null` = fechada · `'novo'` = criando · um gasto = editando. */
  alvo: Gasto | 'novo' | null
  categorias: Categoria[]
  onFechar: () => void
  onSalvo: () => void
}) {
  const { t } = useTranslation()

  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [moeda, setMoeda] = useState<Moeda>('BRL')
  const [cotacao, setCotacao] = useState('')
  const [buscandoCotacao, setBuscandoCotacao] = useState(false)
  const [cotacaoFalhou, setCotacaoFalhou] = useState(false)
  const [categoriaId, setCategoriaId] = useState<number | 'sem'>('sem')
  const [ocorreuEm, setOcorreuEm] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Recarrega os campos a cada abertura. Sem isto, abrir "novo gasto" logo depois
  // de ter editado o almoço de ontem traria os dados do almoço no formulário.
  useEffect(() => {
    if (!alvo) return

    const editando = alvo !== 'novo' ? alvo : null
    setNome(editando?.nome ?? '')
    setValor(editando ? textoDeValor(editando.valor) : '')
    setMoeda(editando?.moeda ?? 'BRL')
    setCotacao(editando?.cotacao == null ? '' : String(editando.cotacao))
    setCategoriaId(editando?.categoriaId ?? 'sem')
    // Um gasto novo nasce com o "agora" já preenchido: o caso comum é registrar
    // o que acabou de acontecer, e nesse caso o campo de data não precisa de
    // nenhum toque. Voltar para ontem continua sendo um clique.
    setOcorreuEm(paraCampoLocal(editando ? new Date(editando.ocorreuEm) : new Date()))
    setBuscandoCotacao(false)
    setCotacaoFalhou(false)
    setErro(null)
  }, [alvo])

  /** Busca a cotação do momento e preenche o campo. */
  async function atualizarCotacao(daMoeda: Moeda) {
    setBuscandoCotacao(true)
    setCotacaoFalhou(false)
    const buscada = await buscarCotacao(daMoeda)
    setBuscandoCotacao(false)

    if (buscada === null) setCotacaoFalhou(true)
    else setCotacao(String(buscada))
  }

  function trocarMoeda(nova: Moeda) {
    setMoeda(nova)
    if (nova === 'BRL') {
      // Some com a cotação junto com o campo: mantê-la guardada faria o valor
      // reaparecer se a pessoa voltasse para US$, com uma taxa que ela já viu
      // sumir da tela.
      setCotacao('')
      setCotacaoFalhou(false)
      return
    }
    void atualizarCotacao(nova)
  }

  const valorEmReais = reaisDeTexto(valor)
  const cotacaoNumero = moeda === 'BRL' ? null : Number(cotacao.replace(',', '.'))
  const cotacaoValida = moeda === 'BRL' || (Number.isFinite(cotacaoNumero) && (cotacaoNumero as number) > 0)

  const valorValido =
    valorEmReais !== null && valorEmReais >= VALOR_MINIMO && valorEmReais <= VALOR_MAXIMO
  const podeSalvar =
    nome.trim().length > 0 && valorValido && cotacaoValida && ocorreuEm !== '' && !salvando

  /**
   * A prévia em reais. O cálculo definitivo é do banco — ver o cabeçalho.
   *
   * O `round` para o centavo repete o `round(x, 2)` da trigger: sem ele a prévia
   * mostraria R$ 258,0100000000000005 num caso e o valor salvo em outro, e a
   * pessoa veria dois números diferentes para o mesmo gasto.
   */
  const previaEmBrl =
    valorEmReais !== null && moeda !== 'BRL' && cotacaoValida
      ? Math.round(valorEmReais * (cotacaoNumero as number) * 100) / 100
      : null

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (!alvo || !podeSalvar) return

    const rascunho = {
      nome,
      valor: valorEmReais as number,
      moeda,
      cotacao: moeda === 'BRL' ? null : (cotacaoNumero as number),
      categoriaId: categoriaId === 'sem' ? null : categoriaId,
      ocorreuEm: new Date(ocorreuEm).toISOString(),
    }

    setErro(null)
    setSalvando(true)
    try {
      if (alvo === 'novo') {
        await criarGasto(rascunho)
        toast.success(t('expenses.form.created'))
      } else {
        await salvarGasto(alvo.id, rascunho)
        toast.success(t('expenses.form.saved'))
      }
      onSalvo()
    } catch (falha) {
      // O erro fica NA MODAL, não num toast: a correção é sempre num campo logo
      // acima, e mandar a pessoa ler um aviso no canto da tela para voltar e
      // corrigir aqui seria um desvio à toa.
      setErro(t(chaveDeErroDeGasto(falha)))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={(aberta) => !aberta && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t(alvo === 'novo' ? 'expenses.form.createTitle' : 'expenses.form.editTitle')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={aoEnviar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gasto-nome">{t('expenses.form.name')}</Label>
            <Input
              id="gasto-nome"
              autoFocus
              maxLength={MAX_DO_NOME}
              placeholder={t('expenses.form.namePlaceholder')}
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              disabled={salvando}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gasto-valor">{t('expenses.form.amount')}</Label>
            <div className="flex gap-2">
              <Input
                id="gasto-valor"
                // `inputMode="decimal"` e não `type="number"`: o teclado do
                // celular abre com os números, mas o campo continua sendo texto —
                // `type="number"` recusa a vírgula em boa parte dos navegadores,
                // e é ela que quem digita em português usa. Quem lê os dois
                // separadores é `reaisDeTexto`.
                inputMode="decimal"
                placeholder={t('expenses.form.amountPlaceholder')}
                // `min-w-0` porque o campo divide a linha com o seletor de
                // moeda: um <input> tem largura intrínseca (~20 caracteres) e o
                // `min-width: auto` do flex o impede de encolher abaixo dela —
                // sem isto a linha estoura para fora da modal num celular estreito.
                className="min-w-0 font-mono"
                value={valor}
                onChange={(evento) => setValor(evento.target.value)}
                disabled={salvando}
              />
              <SeletorDeMoeda valor={moeda} onValor={trocarMoeda} desabilitado={salvando} />
            </div>
          </div>

          {moeda !== 'BRL' && (
            <div className="space-y-2">
              <Label htmlFor="gasto-cotacao">{t('expenses.form.rate', { currency: moeda })}</Label>
              <div className="flex gap-2">
                <Input
                  id="gasto-cotacao"
                  inputMode="decimal"
                  className="min-w-0 font-mono"
                  value={cotacao}
                  onChange={(evento) => {
                    setCotacao(evento.target.value)
                    setCotacaoFalhou(false)
                  }}
                  disabled={salvando || buscandoCotacao}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => void atualizarCotacao(moeda)}
                  disabled={salvando || buscandoCotacao}
                  aria-label={t('expenses.form.refreshRate')}
                >
                  {buscandoCotacao ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw aria-hidden />
                  )}
                </Button>
              </div>

              {cotacaoFalhou && (
                <Alert variant="warning">
                  <TriangleAlert aria-hidden />
                  {t('expenses.form.rateFailed')}
                </Alert>
              )}

              {previaEmBrl !== null && (
                <p className="text-xs text-muted-foreground">
                  {t('expenses.form.preview', { value: formatMoney(previaEmBrl) })}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="gasto-categoria">{t('expenses.form.category')}</Label>
            <SeletorDeCategoria
              id="gasto-categoria"
              valor={categoriaId}
              onValor={(escolha) => setCategoriaId(escolha === null ? 'sem' : escolha)}
              categorias={categorias}
              desabilitado={salvando}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gasto-data">{t('expenses.form.occurredAt')}</Label>
            <Input
              id="gasto-data"
              type="datetime-local"
              value={ocorreuEm}
              onChange={(evento) => setOcorreuEm(evento.target.value)}
              disabled={salvando}
            />
          </div>

          {erro && <Alert variant="destructive">{erro}</Alert>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onFechar} disabled={salvando}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!podeSalvar}>
              {salvando && <Loader2 className="animate-spin" aria-hidden />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
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
    <div className="flex shrink-0" role="group" aria-label={t('expenses.form.currency')}>
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

/**
 * `Date` → o texto que o `<input type="datetime-local">` entende
 * (`YYYY-MM-DDTHH:mm`), **no fuso de quem está olhando**.
 *
 * `toISOString()` não serve aqui: ele converte para UTC, e em Brasília o "agora"
 * de um gasto registrado às 21h apareceria no campo como meia-noite do dia
 * seguinte. O caminho de volta é `new Date(texto)`, que lê a string sem fuso como
 * hora local — as duas pontas concordam, e o ISO só aparece na hora de mandar
 * para o banco.
 */
function paraCampoLocal(data: Date): string {
  const doisDigitos = (numero: number) => String(numero).padStart(2, '0')
  return (
    `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}` +
    `T${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`
  )
}

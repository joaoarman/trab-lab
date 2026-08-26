import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, Receipt, TriangleAlert } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card'
import { Separator } from '@/shared/components/ui/separator'
import { agruparPorDia, rotuloDoDia } from '@/shared/data/extrato'
import type { Categoria, FiltroDeGastos, Gasto } from '@/shared/data/model'
import { formatMoney } from '@/shared/i18n/format'
import { periodoDe, type Atalho, type PeriodoEscolhido } from '@/shared/utils/datas'
import { somar } from '@/shared/utils/dinheiro'
import { listarCategorias, listarGastos } from './supabase'
import { DialogoDeGasto } from './components/DialogoDeGasto'
import { DialogoDeRemocaoDeGasto } from './components/DialogoDeRemocaoDeGasto'
import { FiltrosDeGastos } from './components/FiltrosDeGastos'
import { LinhaDeGasto } from './components/LinhaDeGasto'

/** O recorte com que a tela abre: o mês corrente — ver `shared/utils/datas.ts`. */
const ATALHO_INICIAL: Atalho = 'esteMes'

/**
 * Gastos — `/expenses`.
 *
 * O dinheiro que saiu, no recorte que a pessoa escolher.
 *
 * ## Esta tela não é o caminho principal de entrada
 *
 * O eixo do produto é o **Chat**: registrar um gasto deve custar uma frase. Aqui
 * se **vê, revisa e ajusta** o que a conversa gravou — e se lança à mão quando
 * for mais rápido. Por isso a tela é, antes de tudo, uma lista com filtro e um
 * total; o botão de criar existe, mas não é o herói.
 *
 * ## O total soma reais, sempre
 *
 * `valorEmBrl` é a coluna somada, nunca `valor`: um gasto em dólar e um em real
 * na mesma soma não dariam dinheiro nenhum. Quem converte é o banco, na gravação,
 * pela cotação do dia do gasto.
 *
 * ## Um `recarregar()` depois de cada mudança
 *
 * As modais não devolvem a linha alterada para ser costurada no estado local:
 * elas avisam que algo mudou e a lista é buscada de novo. É uma requisição a
 * mais, e ela paga por si — um gasto editado pode sair do período filtrado, ou
 * mudar de categoria e sair do filtro de categoria. Decidir isso no cliente seria
 * reescrever, em TypeScript, o `where` que o banco acabou de aplicar.
 */
export function GastosPage() {
  const { t } = useTranslation()

  const [gastos, setGastos] = useState<Gasto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [carregando, setCarregando] = useState(true)

  // Duas falhas possíveis, dois estados. Um booleano só não serviria: a busca dos
  // gastos roda de novo a cada filtro e limparia, sem querer, o aviso de que as
  // categorias não vieram — e a lista seguiria mostrando "Sem categoria" em gastos
  // que estão classificados, sem nada na tela explicando por quê.
  const [erroDeGastos, setErroDeGastos] = useState(false)
  const [erroDeCategorias, setErroDeCategorias] = useState(false)

  const [periodo, setPeriodo] = useState<PeriodoEscolhido>(ATALHO_INICIAL)
  const [filtro, setFiltro] = useState<FiltroDeGastos>(() => ({
    ...periodoDe(ATALHO_INICIAL),
    categoriaId: null,
  }))

  const [categoriasProntas, setCategoriasProntas] = useState(false)
  const [formulario, setFormulario] = useState<Gasto | 'novo' | null>(null)
  const [aRemover, setARemover] = useState<Gasto | null>(null)

  /**
   * As categorias são buscadas **uma vez**, e não a cada troca de filtro: elas
   * mudam em outra tela, não aqui. Servem a três coisas — o seletor do
   * formulário, o do filtro e o **nome da categoria em cada linha** da lista.
   */
  const carregarCategorias = useCallback(async () => {
    setErroDeCategorias(false)
    try {
      setCategorias(await listarCategorias())
    } catch {
      setErroDeCategorias(true)
    } finally {
      // Mesmo falhando: o `true` aqui é o que libera a busca dos gastos. Sem ele,
      // uma falha nas categorias deixaria a tela girando para sempre — e os
      // gastos não dependem delas para serem listados.
      setCategoriasProntas(true)
    }
  }, [])

  useEffect(() => {
    void carregarCategorias()
  }, [carregarCategorias])

  const recarregar = useCallback(async () => {
    setErroDeGastos(false)
    setCarregando(true)
    try {
      setGastos(await listarGastos(filtro, categorias))
    } catch {
      setErroDeGastos(true)
    } finally {
      setCarregando(false)
    }
  }, [filtro, categorias])

  /**
   * A trava `categoriasProntas` evita a busca dobrada da estreia.
   *
   * `recarregar` depende de `categorias` (é dela que saem os ids da subárvore no
   * filtro por categoria), então, sem a trava, a tela buscaria os gastos uma vez
   * com a lista ainda vazia e outra assim que ela chegasse. Duas requisições, e a
   * primeira sempre jogada fora.
   */
  useEffect(() => {
    if (!categoriasProntas) return
    void recarregar()
  }, [categoriasProntas, recarregar])

  // `somar`, e não um `reduce` com `+`: o `number` do JavaScript é binário, e
  // acumular reais direto acaba mostrando um total um centavo fora da soma que a
  // pessoa faz na calculadora. Ver `shared/utils/dinheiro.ts`.
  const total = useMemo(() => somar(gastos.map((gasto) => gasto.valorEmBrl)), [gastos])

  const dias = useMemo(
    () => agruparPorDia(gastos, (gasto) => gasto.ocorreuEm, (gasto) => gasto.valorEmBrl),
    [gastos],
  )

  return (
    <>
      {/* Sem título aqui: quem escreve "Gastos" no topo é o header, a partir de
          `navigation.ts`. Repeti-lo daria dois <h1> na mesma tela. */}
      <div className="space-y-6">
        {(erroDeGastos || erroDeCategorias) && (
          <Alert variant="destructive" className="justify-between">
            <span className="flex items-center gap-2">
              <TriangleAlert aria-hidden />
              {t(erroDeGastos ? 'expenses.page.loadFailed' : 'expenses.page.categoriesFailed')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (erroDeCategorias) void carregarCategorias()
                if (erroDeGastos) void recarregar()
              }}
            >
              {t('expenses.page.retry')}
            </Button>
          </Alert>
        )}

        <Card>
          <CardContent className="p-4">
            <FiltrosDeGastos
              filtro={filtro}
              onFiltro={setFiltro}
              periodo={periodo}
              onPeriodo={setPeriodo}
              categorias={categorias}
              desabilitado={carregando}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 p-4">
            {/* O total é o que a pessoa veio ver: fica no topo, grande, em
                `--expense` e em `font-mono` — dígitos monoespaçados alinham na
                vertical, e é assim que uma coluna de dinheiro se lê. */}
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">
                {t('expenses.page.count', { count: gastos.length })}
              </span>
              <span className="block font-mono text-2xl font-semibold text-expense">
                {formatMoney(total)}
              </span>
            </span>

            <Button size="sm" onClick={() => setFormulario('novo')}>
              <Plus aria-hidden />
              {t('expenses.page.new')}
            </Button>
          </CardHeader>

          <CardContent className="p-4 pt-0">
            {carregando ? (
              <div className="flex min-h-40 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : gastos.length === 0 ? (
              <EstadoVazio onCriar={() => setFormulario('novo')} />
            ) : (
              <div className="space-y-4">
                {dias.map((dia) => (
                  <section key={dia.data} aria-label={rotuloDoDia(dia.data)}>
                    {/* O separador de dia com o total do dia: é o que transforma
                        uma lista corrida em extrato. Sem ele, "gastei muito na
                        sexta?" só se responde somando as linhas de cabeça. */}
                    <header className="flex items-baseline justify-between gap-2 px-2 pb-1">
                      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {rotuloDoDia(dia.data)}
                      </h2>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatMoney(dia.total)}
                      </span>
                    </header>
                    <Separator />
                    <ul>
                      {dia.lancamentos.map((gasto) => (
                        <LinhaDeGasto
                          key={gasto.id}
                          gasto={gasto}
                          categorias={categorias}
                          onEditar={setFormulario}
                          onRemover={setARemover}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DialogoDeGasto
        alvo={formulario}
        categorias={categorias}
        onFechar={() => setFormulario(null)}
        onSalvo={() => {
          // Fecha ANTES de recarregar: a modal reajusta os campos quando o alvo
          // muda, e trocar a lista com ela ainda aberta piscaria o formulário
          // durante a animação de saída.
          setFormulario(null)
          void recarregar()
        }}
      />

      <DialogoDeRemocaoDeGasto
        gasto={aRemover}
        onFechar={() => setARemover(null)}
        onRemovido={() => {
          setARemover(null)
          void recarregar()
        }}
      />
    </>
  )
}

/**
 * A lista sem nada para mostrar.
 *
 * Não diz "nenhum gasto" e para por aí: a tela tem filtro, e a causa mais comum
 * de uma lista vazia é o recorte, não a ausência de gastos. O texto aponta para
 * as duas saídas — mexer no período ou registrar o primeiro — e conta que o Chat
 * também registra, que é o caminho pretendido do sistema.
 */
function EstadoVazio({ onCriar }: { onCriar: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-expense-muted text-expense">
        <Receipt className="size-6" aria-hidden />
      </span>
      <h2 className="font-display text-lg font-semibold">{t('expenses.empty.title')}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        {t('expenses.empty.description')}
      </p>
      <Button className="mt-1" onClick={onCriar}>
        <Plus aria-hidden />
        {t('expenses.empty.action')}
      </Button>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, TrendingUp, TriangleAlert } from 'lucide-react'

import { FiltroDePeriodo } from '@/shared/components/FiltroDePeriodo'
import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card'
import { Separator } from '@/shared/components/ui/separator'
import { agruparPorDia, rotuloDoDia } from '@/shared/data/extrato'
import type { FiltroDeReceitas, Receita } from '@/shared/data/model'
import { formatMoney } from '@/shared/i18n/format'
import { periodoDe, type Atalho, type PeriodoEscolhido } from '@/shared/utils/datas'
import { somar } from '@/shared/utils/dinheiro'
import { listarReceitas } from './supabase'
import { DialogoDeReceita } from './components/DialogoDeReceita'
import { DialogoDeRemocaoDeReceita } from './components/DialogoDeRemocaoDeReceita'
import { LinhaDeReceita } from './components/LinhaDeReceita'

/** O recorte com que a tela abre: o mês corrente — ver `shared/utils/datas.ts`. */
const ATALHO_INICIAL: Atalho = 'esteMes'

/**
 * Receitas — `/income`.
 *
 * O dinheiro que entrou, no recorte que a pessoa escolher.
 *
 * ## Esta tela não é o caminho principal de entrada
 *
 * O eixo do produto é o **Chat**: registrar deve custar uma frase. Aqui se **vê,
 * revisa e ajusta** o que a conversa gravou — e se lança à mão quando for mais
 * rápido. Por isso a tela é, antes de tudo, uma lista com filtro e um total; o
 * botão de criar existe, mas não é o herói.
 *
 * ## Mais simples que Gastos, e de propósito
 *
 * Receita não tem categoria, então esta página não carrega
 * a árvore, não tem seletor de categoria no filtro nem no formulário, e tem **um
 * único estado de erro** em vez de dois — não há uma segunda busca que possa
 * falhar sozinha. O filtro é só o período, e o `useEffect` que recarrega depende
 * de uma coisa só, o que dispensa a trava de "primeira busca" que Gastos precisa.
 *
 * ## O total soma reais, sempre
 *
 * `valorEmBrl` é a coluna somada, nunca `valor`: uma receita em dólar e uma em
 * real na mesma soma não dariam dinheiro nenhum. Quem converte é o banco, na
 * gravação, pela cotação do dia em que o dinheiro entrou.
 *
 * ## Um `recarregar()` depois de cada mudança
 *
 * As modais não devolvem a linha alterada para ser costurada no estado local:
 * elas avisam que algo mudou e a lista é buscada de novo. É uma requisição a
 * mais, e ela paga por si — uma receita editada pode sair do período filtrado.
 * Decidir isso no cliente seria reescrever, em TypeScript, o `where` que o banco
 * acabou de aplicar.
 */
export function ReceitasPage() {
  const { t } = useTranslation()

  const [receitas, setReceitas] = useState<Receita[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  const [periodo, setPeriodo] = useState<PeriodoEscolhido>(ATALHO_INICIAL)
  const [filtro, setFiltro] = useState<FiltroDeReceitas>(() => periodoDe(ATALHO_INICIAL))

  const [formulario, setFormulario] = useState<Receita | 'nova' | null>(null)
  const [aRemover, setARemover] = useState<Receita | null>(null)

  const recarregar = useCallback(async () => {
    setErro(false)
    setCarregando(true)
    try {
      setReceitas(await listarReceitas(filtro))
    } catch {
      setErro(true)
    } finally {
      setCarregando(false)
    }
  }, [filtro])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  // `somar`, e não um `reduce` com `+`: o `number` do JavaScript é binário, e
  // acumular reais direto acaba mostrando um total um centavo fora da soma que a
  // pessoa faz na calculadora. Ver `shared/utils/dinheiro.ts`.
  const total = useMemo(() => somar(receitas.map((receita) => receita.valorEmBrl)), [receitas])

  const dias = useMemo(
    () => agruparPorDia(receitas, (receita) => receita.recebidaEm, (receita) => receita.valorEmBrl),
    [receitas],
  )

  return (
    <>
      {/* Sem título aqui: quem escreve "Receitas" no topo é o header, a partir de
          `navigation.ts`. Repeti-lo daria dois <h1> na mesma tela. */}
      <div className="space-y-6">
        {erro && (
          <Alert variant="destructive" className="justify-between">
            <span className="flex items-center gap-2">
              <TriangleAlert aria-hidden />
              {t('income.page.loadFailed')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void recarregar()}>
              {t('income.page.retry')}
            </Button>
          </Alert>
        )}

        <Card>
          <CardContent className="p-4">
            {/* Três campos: uma coluna no celular, três no tablet para cima. O
                quarto campo de Gastos (a categoria) não existe aqui, então a
                grade cabe mais cedo. */}
            <div className="grid gap-4 sm:grid-cols-3">
              <FiltroDePeriodo
                recorte={filtro}
                onRecorte={setFiltro}
                periodo={periodo}
                onPeriodo={setPeriodo}
                desabilitado={carregando}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 p-4">
            {/* O total é o que a pessoa veio ver: fica no topo, grande, em
                `--income` e em `font-mono` — dígitos monoespaçados alinham na
                vertical, e é assim que uma coluna de dinheiro se lê. */}
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">
                {t('income.page.count', { count: receitas.length })}
              </span>
              <span className="block font-mono text-2xl font-semibold text-income">
                {formatMoney(total)}
              </span>
            </span>

            <Button size="sm" onClick={() => setFormulario('nova')}>
              <Plus aria-hidden />
              {t('income.page.new')}
            </Button>
          </CardHeader>

          <CardContent className="p-4 pt-0">
            {carregando ? (
              <div className="flex min-h-40 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : receitas.length === 0 ? (
              <EstadoVazio onCriar={() => setFormulario('nova')} />
            ) : (
              <div className="space-y-4">
                {dias.map((dia) => (
                  <section key={dia.data} aria-label={rotuloDoDia(dia.data)}>
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
                      {dia.lancamentos.map((receita) => (
                        <LinhaDeReceita
                          key={receita.id}
                          receita={receita}
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

      <DialogoDeReceita
        alvo={formulario}
        onFechar={() => setFormulario(null)}
        onSalvo={() => {
          // Fecha ANTES de recarregar: a modal reajusta os campos quando o alvo
          // muda, e trocar a lista com ela ainda aberta piscaria o formulário
          // durante a animação de saída.
          setFormulario(null)
          void recarregar()
        }}
      />

      <DialogoDeRemocaoDeReceita
        receita={aRemover}
        onFechar={() => setARemover(null)}
        onRemovida={() => {
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
 * Não diz "nenhuma receita" e para por aí: a tela tem filtro, e a causa mais
 * comum de uma lista vazia é o recorte, não a ausência de receitas. O texto
 * aponta para as duas saídas — mexer no período ou registrar a primeira — e conta
 * que o Chat também registra, que é o caminho pretendido do sistema.
 */
function EstadoVazio({ onCriar }: { onCriar: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-income-muted text-income">
        <TrendingUp className="size-6" aria-hidden />
      </span>
      <h2 className="font-display text-lg font-semibold">{t('income.empty.title')}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">{t('income.empty.description')}</p>
      <Button className="mt-1" onClick={onCriar}>
        <Plus aria-hidden />
        {t('income.empty.action')}
      </Button>
    </div>
  )
}

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

const ATALHO_INICIAL: Atalho = 'esteMes'

export function GastosPage() {
  const { t } = useTranslation()

  const [gastos, setGastos] = useState<Gasto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [carregando, setCarregando] = useState(true)

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

  const carregarCategorias = useCallback(async () => {
    setErroDeCategorias(false)
    try {
      setCategorias(await listarCategorias())
    } catch {
      setErroDeCategorias(true)
    } finally {
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

  useEffect(() => {
    if (!categoriasProntas) return
    void recarregar()
  }, [categoriasProntas, recarregar])

  const total = useMemo(() => somar(gastos.map((gasto) => gasto.valorEmBrl)), [gastos])

  const dias = useMemo(
    () => agruparPorDia(gastos, (gasto) => gasto.ocorreuEm, (gasto) => gasto.valorEmBrl),
    [gastos],
  )

  return (
    <>
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

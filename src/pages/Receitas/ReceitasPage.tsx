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

const ATALHO_INICIAL: Atalho = 'esteMes'

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

  const total = useMemo(() => somar(receitas.map((receita) => receita.valorEmBrl)), [receitas])

  const dias = useMemo(
    () => agruparPorDia(receitas, (receita) => receita.recebidaEm, (receita) => receita.valorEmBrl),
    [receitas],
  )

  return (
    <>
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

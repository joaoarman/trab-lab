import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Loader2, MessageCircle, TriangleAlert, Wallet } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card'
import { Separator } from '@/shared/components/ui/separator'
import { agruparPorDia, rotuloDoDia } from '@/shared/data/extrato'
import type { Categoria, FiltroDaFatura, Lancamento } from '@/shared/data/model'
import { formatMoney } from '@/shared/i18n/format'
import { cn } from '@/shared/lib/utils'
import { periodoDe, type Atalho, type PeriodoEscolhido } from '@/shared/utils/datas'
import { chaveDoLancamento, totaisDaFatura, valorComSinal } from './fatura'
import { listarCategorias, listarLancamentos } from './supabase'
import { FiltrosDaFatura } from './components/FiltrosDaFatura'
import { LinhaDaFatura } from './components/LinhaDaFatura'

const ATALHO_INICIAL: Atalho = 'esteMes'

export function FaturaPage() {
  const { t } = useTranslation()

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [carregando, setCarregando] = useState(true)

  const [erroDaLista, setErroDaLista] = useState(false)
  const [erroDeCategorias, setErroDeCategorias] = useState(false)

  const [periodo, setPeriodo] = useState<PeriodoEscolhido>(ATALHO_INICIAL)
  const [filtro, setFiltro] = useState<FiltroDaFatura>(() => ({
    ...periodoDe(ATALHO_INICIAL),
    tipo: null,
  }))

  useEffect(() => {
    void (async () => {
      setErroDeCategorias(false)
      try {
        setCategorias(await listarCategorias())
      } catch {
        setErroDeCategorias(true)
      }
    })()
  }, [])

  const recarregar = useCallback(async () => {
    setErroDaLista(false)
    setCarregando(true)
    try {
      setLancamentos(await listarLancamentos(filtro))
    } catch {
      setErroDaLista(true)
    } finally {
      setCarregando(false)
    }
  }, [filtro])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const totais = useMemo(() => totaisDaFatura(lancamentos), [lancamentos])

  const dias = useMemo(
    () => agruparPorDia(lancamentos, (l) => l.aconteceuEm, valorComSinal),
    [lancamentos],
  )

  return (
    <div className="space-y-6">
      {(erroDaLista || erroDeCategorias) && (
        <Alert variant="destructive" className="justify-between">
          <span className="flex items-center gap-2">
            <TriangleAlert aria-hidden />
            {t(erroDaLista ? 'statement.page.loadFailed' : 'statement.page.categoriesFailed')}
          </span>
          {erroDaLista && (
            <Button variant="ghost" size="sm" onClick={() => void recarregar()}>
              {t('statement.page.retry')}
            </Button>
          )}
        </Alert>
      )}

      <Card>
        <CardContent className="p-4">
          <FiltrosDaFatura
            filtro={filtro}
            onFiltro={setFiltro}
            periodo={periodo}
            onPeriodo={setPeriodo}
            desabilitado={carregando}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3 p-4">
          <span className="block text-xs text-muted-foreground">
            {t('statement.page.count', { count: lancamentos.length })}
          </span>

          <div className="grid grid-cols-3 gap-3">
            <Total rotulo={t('statement.page.in')} valor={totais.entrou} className="text-income" />
            <Total rotulo={t('statement.page.out')} valor={totais.saiu} className="text-expense" />
            <Total
              rotulo={t('statement.page.balance')}
              valor={totais.saldo}
              opcoes={{ signDisplay: 'exceptZero' }}
              className={totais.saldo < 0 ? 'text-expense' : 'text-income'}
              destaque
            />
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0">
          {carregando ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : lancamentos.length === 0 ? (
            <EstadoVazio />
          ) : (
            <div className="space-y-4">
              {dias.map((dia) => (
                <section key={dia.data} aria-label={rotuloDoDia(dia.data)}>
                  <header className="flex items-baseline justify-between gap-2 px-2 pb-1">
                    <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {rotuloDoDia(dia.data)}
                    </h2>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatMoney(dia.total, 'BRL', { signDisplay: 'exceptZero' })}
                    </span>
                  </header>
                  <Separator />
                  <ul>
                    {dia.lancamentos.map((lancamento) => (
                      <LinhaDaFatura
                        key={chaveDoLancamento(lancamento)}
                        lancamento={lancamento}
                        categorias={categorias}
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
  )
}

function Total({
  rotulo,
  valor,
  opcoes,
  className,
  destaque,
}: {
  rotulo: string
  valor: number
  opcoes?: Intl.NumberFormatOptions
  className?: string
  destaque?: boolean
}) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-xs text-muted-foreground">{rotulo}</span>
      <span
        className={cn(
          'block truncate font-mono font-semibold',
          destaque ? 'text-lg sm:text-2xl' : 'text-base sm:text-xl',
          className,
        )}
      >
        {formatMoney(valor, 'BRL', opcoes)}
      </span>
    </span>
  )
}

function EstadoVazio() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-primary-muted text-primary">
        <Wallet className="size-6" aria-hidden />
      </span>
      <h2 className="font-display text-lg font-semibold">{t('statement.empty.title')}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">{t('statement.empty.description')}</p>
      <Button asChild className="mt-1">
        <Link to="/chat">
          <MessageCircle aria-hidden />
          {t('statement.empty.action')}
        </Link>
      </Button>
    </div>
  )
}

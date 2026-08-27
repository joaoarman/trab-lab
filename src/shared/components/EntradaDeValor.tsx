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

export function EntradaDeValor({
  id,
  valor,
  onValor,
  moeda,
  onMoeda,
  cotacao,
  onCotacao,
  valorEmReais,
  desabilitado,
}: {
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
      onCotacao('')
      setFalhou(false)
      return
    }
    void atualizarCotacao(nova)
  }

  const numeroDaCotacao = numeroDeCotacao(cotacao)

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
            inputMode="decimal"
            placeholder={t('money.amountPlaceholder')}
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

export function numeroDeCotacao(texto: string): number | null {
  const numero = Number(texto.replace(',', '.'))
  return Number.isFinite(numero) && numero > 0 ? numero : null
}

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
            valor === codigo && 'relative z-10',
          )}
        >
          {simbolo}
        </Button>
      ))}
    </div>
  )
}

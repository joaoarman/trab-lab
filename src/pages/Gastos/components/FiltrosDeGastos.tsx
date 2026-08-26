import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import type { Categoria, FiltroDeGastos } from '@/shared/data/model'
import { ATALHOS, periodoDe, type PeriodoEscolhido } from '../periodo'
import { SeletorDeCategoria } from './SeletorDeCategoria'

/** O valor do seletor quando as datas foram escolhidas à mão. */
const PERSONALIZADO = 'personalizado'

/**
 * O recorte que a lista está mostrando: período + categoria.
 *
 * ## Por que o atalho e as datas convivem
 *
 * O seletor de período responde à pergunta comum em **um** clique ("este mês"), e
 * os dois campos de data respondem a qualquer outra. Eles não são alternativas
 * escondidas uma atrás da outra: as datas ficam **sempre visíveis**, mostrando o
 * que o atalho escolheu, porque "este mês" sem dizer de quando até quando obriga
 * a pessoa a confiar. Mexer numa das datas leva o seletor para "personalizado" —
 * o rótulo passa a dizer a verdade sobre o que está na tela.
 *
 * ## Nada de botão "aplicar"
 *
 * Cada mudança recarrega a lista na hora. Um botão a mais entre a escolha e o
 * resultado é um clique a mais em cima do gesto mais repetido da tela, e o
 * usuário perde o retorno imediato de "foi isso mesmo que eu quis ver?".
 */
export function FiltrosDeGastos({
  filtro,
  onFiltro,
  periodo,
  onPeriodo,
  categorias,
  desabilitado,
}: {
  filtro: FiltroDeGastos
  onFiltro: (filtro: FiltroDeGastos) => void
  /** Qual atalho está selecionado — ou `'personalizado'`. */
  periodo: PeriodoEscolhido
  onPeriodo: (periodo: PeriodoEscolhido) => void
  categorias: Categoria[]
  desabilitado: boolean
}) {
  const { t } = useTranslation()

  function trocarAtalho(escolha: string) {
    if (escolha === PERSONALIZADO) {
      onPeriodo(PERSONALIZADO)
      return
    }
    const atalho = escolha as (typeof ATALHOS)[number]
    onPeriodo(atalho)
    onFiltro({ ...filtro, ...periodoDe(atalho) })
  }

  /** Mexer numa data à mão desfaz o atalho: o rótulo tem de dizer a verdade. */
  function trocarData(campo: 'de' | 'ate', valor: string) {
    if (!valor) return
    onPeriodo(PERSONALIZADO)
    onFiltro({ ...filtro, [campo]: valor })
  }

  return (
    // Uma coluna no celular, duas no tablet e quatro no monitor: os campos são
    // curtos, e espremer quatro deles num telefone deixaria as datas ilegíveis.
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Campo id="filtro-periodo" rotulo={t('expenses.filters.period')}>
        <Select value={periodo} onValueChange={trocarAtalho} disabled={desabilitado}>
          <SelectTrigger id="filtro-periodo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ATALHOS.map((atalho) => (
              <SelectItem key={atalho} value={atalho}>
                {t(`expenses.filters.${atalho}`)}
              </SelectItem>
            ))}
            {/* Presente na lista, mas escolhido pelas datas: deixá-lo de fora
                faria o seletor exibir um rótulo vazio assim que alguém mexesse
                num dos campos ao lado. */}
            <SelectItem value={PERSONALIZADO}>{t('expenses.filters.custom')}</SelectItem>
          </SelectContent>
        </Select>
      </Campo>

      <Campo id="filtro-de" rotulo={t('expenses.filters.from')}>
        <Input
          id="filtro-de"
          type="date"
          value={filtro.de}
          max={filtro.ate}
          onChange={(evento) => trocarData('de', evento.target.value)}
          disabled={desabilitado}
        />
      </Campo>

      <Campo id="filtro-ate" rotulo={t('expenses.filters.to')}>
        <Input
          id="filtro-ate"
          type="date"
          value={filtro.ate}
          min={filtro.de}
          onChange={(evento) => trocarData('ate', evento.target.value)}
          disabled={desabilitado}
        />
      </Campo>

      <Campo id="filtro-categoria" rotulo={t('expenses.filters.category')}>
        <SeletorDeCategoria
          id="filtro-categoria"
          valor={filtro.categoriaId}
          onValor={(categoriaId) => onFiltro({ ...filtro, categoriaId })}
          categorias={categorias}
          comOpcaoTodas
          desabilitado={desabilitado}
        />
      </Campo>
    </div>
  )
}

/** Rótulo + controle. Existe só para os quatro campos não repetirem o wrapper. */
function Campo({
  id,
  rotulo,
  children,
}: {
  id: string
  rotulo: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo}
      </Label>
      {children}
    </div>
  )
}

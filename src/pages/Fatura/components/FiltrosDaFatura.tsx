import { useTranslation } from 'react-i18next'

import { CampoDeFiltro, FiltroDePeriodo } from '@/shared/components/FiltroDePeriodo'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import type { FiltroDaFatura, TipoDeLancamento } from '@/shared/data/model'
import type { PeriodoEscolhido } from '@/shared/utils/datas'

export function FiltrosDaFatura({
  filtro,
  onFiltro,
  periodo,
  onPeriodo,
  desabilitado,
}: {
  filtro: FiltroDaFatura
  onFiltro: (filtro: FiltroDaFatura) => void
  periodo: PeriodoEscolhido
  onPeriodo: (periodo: PeriodoEscolhido) => void
  desabilitado: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <FiltroDePeriodo
        recorte={filtro}
        onRecorte={(recorte) => onFiltro({ ...filtro, ...recorte })}
        periodo={periodo}
        onPeriodo={onPeriodo}
        desabilitado={desabilitado}
      />

      <CampoDeFiltro id="filtro-tipo" rotulo={t('statement.filters.type')}>
        <Select
          value={filtro.tipo ?? TODOS}
          onValueChange={(escolha) =>
            onFiltro({
              ...filtro,
              tipo: escolha === TODOS ? null : (escolha as TipoDeLancamento),
            })
          }
          disabled={desabilitado}
        >
          <SelectTrigger id="filtro-tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{t('statement.filters.all')}</SelectItem>
            <SelectItem value="RECEITA">{t('statement.filters.onlyIncome')}</SelectItem>
            <SelectItem value="GASTO">{t('statement.filters.onlyExpenses')}</SelectItem>
          </SelectContent>
        </Select>
      </CampoDeFiltro>
    </div>
  )
}

const TODOS = 'todos'

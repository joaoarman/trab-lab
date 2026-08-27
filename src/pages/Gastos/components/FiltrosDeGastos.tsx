import { useTranslation } from 'react-i18next'

import { CampoDeFiltro, FiltroDePeriodo } from '@/shared/components/FiltroDePeriodo'
import type { Categoria, FiltroDeGastos } from '@/shared/data/model'
import type { PeriodoEscolhido } from '@/shared/utils/datas'
import { SeletorDeCategoria } from './SeletorDeCategoria'

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
  periodo: PeriodoEscolhido
  onPeriodo: (periodo: PeriodoEscolhido) => void
  categorias: Categoria[]
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

      <CampoDeFiltro id="filtro-categoria" rotulo={t('expenses.filters.category')}>
        <SeletorDeCategoria
          id="filtro-categoria"
          valor={filtro.categoriaId}
          onValor={(categoriaId) => onFiltro({ ...filtro, categoriaId })}
          categorias={categorias}
          comOpcaoTodas
          desabilitado={desabilitado}
        />
      </CampoDeFiltro>
    </div>
  )
}

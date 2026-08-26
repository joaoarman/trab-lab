import { useTranslation } from 'react-i18next'

import { CampoDeFiltro, FiltroDePeriodo } from '@/shared/components/FiltroDePeriodo'
import type { Categoria, FiltroDeGastos } from '@/shared/data/model'
import type { PeriodoEscolhido } from '@/shared/utils/datas'
import { SeletorDeCategoria } from './SeletorDeCategoria'

/**
 * O recorte que a lista de gastos está mostrando: período + categoria.
 *
 * O período vem inteiro de
 * [`FiltroDePeriodo`](../../../shared/components/FiltroDePeriodo.tsx) — os
 * atalhos, as duas datas e a regra de "mexer numa data desfaz o atalho" são os
 * mesmos de Receitas, e viveriam em duas cópias divergentes se ficassem aqui.
 * O que este componente acrescenta é o **quarto campo**, que só Gastos tem: a
 * categoria.
 *
 * A grade é montada aqui, e não lá dentro, justamente por causa desse quarto
 * campo: uma coluna no celular, duas no tablet (`sm:`) e quatro no monitor
 * (`lg:`). Os campos são curtos, e espremer quatro deles num telefone deixaria as
 * datas ilegíveis.
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

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <FiltroDePeriodo
        recorte={filtro}
        // O período devolve só as duas datas; o `categoriaId` que já estava
        // escolhido é preservado aqui, e não lá dentro — o componente
        // compartilhado não sabe (nem precisa saber) que existe um quarto campo.
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

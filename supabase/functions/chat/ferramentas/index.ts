import type { Ferramenta } from './comum.ts'
import { FERRAMENTAS_DE_GASTOS } from './gastos.ts'
import { FERRAMENTAS_DE_RECEITAS } from './receitas.ts'
import { FERRAMENTAS_DE_CATEGORIAS } from './categorias.ts'
import { FERRAMENTAS_DE_ESCOPO } from './escopo.ts'

export const FERRAMENTAS: Record<string, Ferramenta> = {
  ...FERRAMENTAS_DE_GASTOS,
  ...FERRAMENTAS_DE_RECEITAS,
  ...FERRAMENTAS_DE_CATEGORIAS,
  ...FERRAMENTAS_DE_ESCOPO,
}

export const SCHEMAS = Object.values(FERRAMENTAS).map((ferramenta) => ferramenta.schema)

export { FERRAMENTA_DE_RECUSA } from './escopo.ts'
export { horaLocal } from './comum.ts'
export type {
  CategoriaConhecida,
  ContextoDaFerramenta,
  Ferramenta,
  Recibo,
} from './comum.ts'

// =============================================================================
// O catálogo de ferramentas do Chat — o único lugar que sabe quais existem.
//
// Um módulo novo (a Agenda, um dia) entra com um arquivo próprio ao lado destes e
// UMA linha aqui. É por isso que o `index.ts` da função não conhece ferramenta
// nenhuma pelo nome: ele lê `FERRAMENTAS[nome]` e executa. Nada além deste
// arquivo precisa mudar.
// =============================================================================
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

/** O que vai no campo `tools` da chamada à OpenAI. */
export const SCHEMAS = Object.values(FERRAMENTAS).map((ferramenta) => ferramenta.schema)

export { FERRAMENTA_DE_RECUSA } from './escopo.ts'
export type {
  CategoriaConhecida,
  ContextoDaFerramenta,
  Ferramenta,
  Recibo,
} from './comum.ts'

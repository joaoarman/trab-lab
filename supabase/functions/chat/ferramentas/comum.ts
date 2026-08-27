import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export interface SchemaDeFerramenta {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type Moeda = 'BRL' | 'USD'

export interface Recibo {
  acao: 'criado' | 'editado' | 'excluido' | 'desativado'
  tipo: 'gasto' | 'receita' | 'categoria'
  id: number
  nome: string
  valor?: number
  moeda?: Moeda
  cotacao?: number | null
  valorEmBrl?: number
  categoria?: string[] | null
  cor?: string
  categoriaCriada?: boolean
  aconteceuEm?: string
  criadoEm: string
}

export interface CategoriaConhecida {
  id: number
  paiId: number | null
  nome: string
  cor: string
  ativa: boolean
  caminho: string[]
}

export interface ContextoDaFerramenta {
  cliente: SupabaseClient
  hoje: string
  fusoEmMinutos: number
  categorias: CategoriaConhecida[]
  recibos: Recibo[]
  categoriasCriadas: number[]
}

export interface Ferramenta {
  schema: SchemaDeFerramenta
  escreve?: boolean
  executar: (ctx: ContextoDaFerramenta, args: Record<string, unknown>) => Promise<unknown>
}

const ERROS_COMUNS: Record<string, string> = {
  profile_not_found: 'Não foi possível identificar o usuário.',
  expense_rate_required: 'Gasto em moeda estrangeira exige a cotação.',
  income_rate_required: 'Receita em moeda estrangeira exige a cotação.',
  expense_amount_out_of_range:
    'O valor convertido para reais não cabe no limite do sistema (máximo R$ 9.999.999,99).',
  income_amount_out_of_range:
    'O valor convertido para reais não cabe no limite do sistema (máximo R$ 9.999.999,99).',
  expense_category_not_found: 'Essa categoria não existe (ou foi excluída).',
  expense_not_found: 'Não existe gasto com esse id.',
  income_not_found: 'Não existe receita com esse id.',
  category_not_found: 'Não existe categoria com esse id.',
  category_parent_deleted: 'A categoria mãe foi excluída.',
  category_cycle: 'Uma categoria não pode ser descendente de si mesma.',
  category_path_empty: 'O caminho da categoria veio vazio.',
  category_path_too_deep: 'Caminho de categoria fundo demais — use no máximo 3 degraus.',
  category_name_invalid: 'Nome de categoria inválido (1 a 60 caracteres).',
}

export function traduzirErroDoBanco(erro: { message?: string; code?: string } | null): never {
  const mensagem = (erro?.message ?? '').toLowerCase()

  for (const [chave, texto] of Object.entries(ERROS_COMUNS)) {
    if (mensagem.includes(chave)) throw new Error(texto)
  }

  if (erro?.code === '23505') {
    throw new Error('Já existe uma categoria com esse nome nesse mesmo lugar da árvore.')
  }
  if (erro?.code === '23514') {
    throw new Error('Valor fora da faixa aceita (de R$ 0,01 a R$ 9.999.999,99).')
  }

  throw new Error('Não foi possível concluir a operação no banco.')
}

export function paraIso(local: string, fusoEmMinutos: number): string | null {
  const casado = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(local.trim())
  if (!casado) return null

  const [, ano, mes, dia, hora = '00', minuto = '00', segundo = '00'] = casado

  const comoSeFosseUtc = Date.UTC(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    Number(hora),
    Number(minuto),
    Number(segundo),
  )
  if (Number.isNaN(comoSeFosseUtc)) return null

  return new Date(comoSeFosseUtc + fusoEmMinutos * 60_000).toISOString()
}

export const SEM_PERIODO = { de: null, ate: null } as const

export function periodoOpcional(
  de: unknown,
  ate: unknown,
  fusoEmMinutos: number,
): { de: string | null; ate: string | null } | null {
  const inicio = texto(de, 10)
  const fim = texto(ate, 10)

  if (!inicio && !fim) return SEM_PERIODO

  const limites = limitesDoPeriodo(inicio ?? '1970-01-01', fim ?? '2999-12-31', fusoEmMinutos)
  if (!limites) return null

  return { de: inicio ? limites.de : null, ate: fim ? limites.ate : null }
}

export function limitesDoPeriodo(
  de: string,
  ate: string,
  fusoEmMinutos: number,
): { de: string; ate: string } | null {
  const inicio = paraIso(`${de.slice(0, 10)}T00:00`, fusoEmMinutos)
  if (!inicio) return null

  const casado = /^(\d{4})-(\d{2})-(\d{2})/.exec(ate.trim())
  if (!casado) return null

  const [, ano, mes, dia] = casado
  const fimLocal = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia) + 1))
  const fim = new Date(fimLocal.getTime() + fusoEmMinutos * 60_000).toISOString()

  return { de: inicio, ate: fim }
}

export function texto(valor: unknown, maximo: number): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' || limpo.length > maximo ? null : limpo
}

export function numero(valor: unknown): number | null {
  const convertido = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(convertido) ? convertido : null
}

export function inteiro(valor: unknown): number | null {
  const convertido = numero(valor)
  return convertido === null ? null : Math.trunc(convertido)
}

export function dinheiro(valor: unknown): number | null {
  const convertido = numero(valor)
  if (convertido === null) return null
  const emCentavos = Math.round(convertido * 100)
  if (emCentavos < 1 || emCentavos > 999_999_999) return null
  return emCentavos / 100
}

export function moeda(valor: unknown): Moeda {
  return valor === 'USD' ? 'USD' : 'BRL'
}

export function caminho(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null
  const nomes = valor.map((parte) => texto(parte, 60)).filter((parte): parte is string => !!parte)
  return nomes.length === 0 || nomes.length > 3 ? null : nomes
}

export function caminhoDaCategoria(
  categorias: CategoriaConhecida[],
  id: number | null,
): string[] | null {
  if (id === null) return null
  return categorias.find((categoria) => categoria.id === id)?.caminho ?? null
}

export async function lembrarCategoria(
  ctx: ContextoDaFerramenta,
  id: number,
): Promise<void> {
  const conhecida = (procurado: number) =>
    ctx.categorias.some((categoria) => categoria.id === procurado)

  if (conhecida(id)) return

  interface LinhaDeCategoria {
    id: number
    parent_id: number | null
    name: string
    color: string
    is_active: boolean
  }

  const faltando: LinhaDeCategoria[] = []
  let alvo: number | null = id

  for (let saltos = 0; alvo !== null && !conhecida(alvo) && saltos < 10; saltos += 1) {
    const { data } = await ctx.cliente
      .from('category')
      .select('id, parent_id, name, color, is_active')
      .eq('id', alvo)
      .maybeSingle()

    if (!data) break

    const linha = data as LinhaDeCategoria
    faltando.push(linha)
    alvo = linha.parent_id
  }

  for (const linha of faltando.reverse()) {
    if (conhecida(linha.id)) continue

    const mae = ctx.categorias.find((categoria) => categoria.id === linha.parent_id)

    ctx.categorias.push({
      id: linha.id,
      paiId: linha.parent_id,
      nome: linha.name,
      cor: linha.color,
      ativa: linha.is_active,
      caminho: [...(mae?.caminho ?? []), linha.name],
    })

    ctx.categoriasCriadas.push(linha.id)
  }
}

export function idsDaSubarvore(categorias: CategoriaConhecida[], raiz: number): number[] {
  const ids = [raiz]

  for (let i = 0; i < ids.length; i++) {
    for (const categoria of categorias) {
      if (categoria.paiId === ids[i] && !ids.includes(categoria.id)) ids.push(categoria.id)
    }
  }

  return ids
}

// Soma em centavos inteiros: em float, 0.1 + 0.2 não dá 0.3.
export function somar(valores: number[]): number {
  return valores.reduce((total, valor) => total + Math.round(valor * 100), 0) / 100
}

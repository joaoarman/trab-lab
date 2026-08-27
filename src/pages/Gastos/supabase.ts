import { supabase } from '@/shared/lib/supabaseClient'
import type { Categoria, FiltroDeGastos, Gasto, Moeda, RascunhoDeGasto } from '@/shared/data/model'
import { idsDaSubarvore } from '@/shared/data/arvoreDeCategorias'

const COLUNAS =
  'id, category_id, name, amount, currency, exchange_rate, amount_brl, occurred_at, is_active, created_at'

interface LinhaDeGasto {
  id: number
  category_id: number | null
  name: string
  // numeric chega como texto no PostgREST
  amount: string | number
  currency: Moeda
  exchange_rate: string | number | null
  amount_brl: string | number
  occurred_at: string
  is_active: boolean
  created_at: string
}

function paraGasto(linha: LinhaDeGasto): Gasto {
  return {
    id: linha.id,
    categoriaId: linha.category_id,
    nome: linha.name,
    valor: Number(linha.amount),
    moeda: linha.currency,
    cotacao: linha.exchange_rate === null ? null : Number(linha.exchange_rate),
    valorEmBrl: Number(linha.amount_brl),
    ocorreuEm: linha.occurred_at,
    ativo: linha.is_active,
    criadoEm: linha.created_at,
  }
}

export async function listarGastos(
  filtro: FiltroDeGastos,
  categorias: Categoria[],
): Promise<Gasto[]> {
  let consulta = supabase
    .from('expense')
    .select(COLUNAS)
    .gte('occurred_at', inicioDoDia(filtro.de))
    .lt('occurred_at', inicioDoDiaSeguinte(filtro.ate))
    .order('occurred_at', { ascending: false })

  if (filtro.categoriaId === 'sem') {
    consulta = consulta.is('category_id', null)
  } else if (filtro.categoriaId !== null) {
    consulta = consulta.in('category_id', idsDaSubarvore(categorias, filtro.categoriaId))
  }

  const { data, error } = await consulta
  if (error) throw error
  return (data as LinhaDeGasto[]).map(paraGasto)
}

export async function listarCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from('category')
    .select('id, parent_id, name, color, is_active, created_at')
    .order('name', { ascending: true })

  if (error) throw error
  return (data as {
    id: number
    parent_id: number | null
    name: string
    color: string
    is_active: boolean
    created_at: string
  }[]).map((linha) => ({
    id: linha.id,
    paiId: linha.parent_id,
    nome: linha.name,
    cor: linha.color,
    ativa: linha.is_active,
    criadaEm: linha.created_at,
  }))
}

export async function criarGasto(rascunho: RascunhoDeGasto): Promise<Gasto> {
  const { data, error } = await supabase
    .from('expense')
    .insert(paraLinha(rascunho))
    .select(COLUNAS)
    .single()

  if (error) throw error
  return paraGasto(data as LinhaDeGasto)
}

export async function salvarGasto(id: number, rascunho: RascunhoDeGasto): Promise<Gasto> {
  const { data, error } = await supabase
    .from('expense')
    .update(paraLinha(rascunho))
    .eq('id', id)
    .select(COLUNAS)
    .single()

  if (error) throw error
  return paraGasto(data as LinhaDeGasto)
}

function paraLinha(rascunho: RascunhoDeGasto) {
  return {
    name: rascunho.nome.trim(),
    amount: rascunho.valor,
    currency: rascunho.moeda,
    exchange_rate: rascunho.cotacao,
    category_id: rascunho.categoriaId,
    occurred_at: rascunho.ocorreuEm,
  }
}

export async function removerGasto(id: number): Promise<void> {
  const { error } = await supabase.rpc('expense_remove', { p_expense_id: id })
  if (error) throw error
}

export function chaveDeErroDeGasto(falha: unknown): string {
  const erro = falha as { code?: string; message?: string } | null
  const raiz = 'expenses.errors'

  const mensagem = erro?.message ?? ''
  if (mensagem.includes('expense_rate_required')) return `${raiz}.cotacaoObrigatoria`
  if (mensagem.includes('expense_amount_out_of_range')) return `${raiz}.valorForaDeFaixa`
  if (mensagem.includes('expense_category_not_found')) return `${raiz}.categoriaNaoEncontrada`
  if (mensagem.includes('expense_not_found')) return `${raiz}.naoEncontrado`

  if (erro?.code === '23514') return `${raiz}.valorForaDeFaixa`

  return `${raiz}.desconhecido`
}

function inicioDoDia(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia).toISOString()
}

function inicioDoDiaSeguinte(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia + 1).toISOString()
}

import { supabase } from '@/shared/lib/supabaseClient'
import type { Categoria, FiltroDaFatura, Lancamento, Moeda } from '@/shared/data/model'
import { inicioDoDia, inicioDoDiaSeguinte } from '@/shared/utils/datas'

const COLUNAS_DE_GASTO =
  'id, category_id, name, amount, currency, exchange_rate, amount_brl, occurred_at'
const COLUNAS_DE_RECEITA = 'id, name, amount, currency, exchange_rate, amount_brl, received_at'

interface LinhaDeDinheiro {
  id: number
  name: string
  // numeric chega como texto no PostgREST
  amount: string | number
  currency: Moeda
  exchange_rate: string | number | null
  amount_brl: string | number
}

interface LinhaDeGasto extends LinhaDeDinheiro {
  category_id: number | null
  occurred_at: string
}

interface LinhaDeReceita extends LinhaDeDinheiro {
  received_at: string
}

function paraLancamento(
  linha: LinhaDeDinheiro,
  tipo: Lancamento['tipo'],
  aconteceuEm: string,
  categoriaId: number | null,
): Lancamento {
  return {
    tipo,
    id: linha.id,
    nome: linha.name,
    valor: Number(linha.amount),
    moeda: linha.currency,
    cotacao: linha.exchange_rate === null ? null : Number(linha.exchange_rate),
    valorEmBrl: Number(linha.amount_brl),
    aconteceuEm,
    categoriaId,
  }
}

export async function listarLancamentos(filtro: FiltroDaFatura): Promise<Lancamento[]> {
  const de = inicioDoDia(filtro.de)
  const ate = inicioDoDiaSeguinte(filtro.ate)

  const buscarGastos = async (): Promise<Lancamento[]> => {
    if (filtro.tipo === 'RECEITA') return []
    const { data, error } = await supabase
      .from('expense')
      .select(COLUNAS_DE_GASTO)
      .gte('occurred_at', de)
      .lt('occurred_at', ate)
      .order('occurred_at', { ascending: false })

    if (error) throw error
    return (data as LinhaDeGasto[]).map((linha) =>
      paraLancamento(linha, 'GASTO', linha.occurred_at, linha.category_id),
    )
  }

  const buscarReceitas = async (): Promise<Lancamento[]> => {
    if (filtro.tipo === 'GASTO') return []
    const { data, error } = await supabase
      .from('income')
      .select(COLUNAS_DE_RECEITA)
      .gte('received_at', de)
      .lt('received_at', ate)
      .order('received_at', { ascending: false })

    if (error) throw error
    return (data as LinhaDeReceita[]).map((linha) =>
      paraLancamento(linha, 'RECEITA', linha.received_at, null),
    )
  }

  const [gastos, receitas] = await Promise.all([buscarGastos(), buscarReceitas()])

  return [...gastos, ...receitas].sort(
    (a, b) => new Date(b.aconteceuEm).getTime() - new Date(a.aconteceuEm).getTime(),
  )
}

export async function listarCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from('category')
    .select('id, parent_id, name, color, is_active, created_at')
    .order('name', { ascending: true })

  if (error) throw error
  return (
    data as {
      id: number
      parent_id: number | null
      name: string
      color: string
      is_active: boolean
      created_at: string
    }[]
  ).map((linha) => ({
    id: linha.id,
    paiId: linha.parent_id,
    nome: linha.name,
    cor: linha.color,
    ativa: linha.is_active,
    criadaEm: linha.created_at,
  }))
}

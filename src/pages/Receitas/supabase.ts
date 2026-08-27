import { supabase } from '@/shared/lib/supabaseClient'
import type { FiltroDeReceitas, Moeda, RascunhoDeReceita, Receita } from '@/shared/data/model'
import { inicioDoDia, inicioDoDiaSeguinte } from '@/shared/utils/datas'

const COLUNAS =
  'id, name, amount, currency, exchange_rate, amount_brl, received_at, is_active, created_at'

interface LinhaDeReceita {
  id: number
  name: string
  // numeric chega como texto no PostgREST
  amount: string | number
  currency: Moeda
  exchange_rate: string | number | null
  amount_brl: string | number
  received_at: string
  is_active: boolean
  created_at: string
}

function paraReceita(linha: LinhaDeReceita): Receita {
  return {
    id: linha.id,
    nome: linha.name,
    valor: Number(linha.amount),
    moeda: linha.currency,
    cotacao: linha.exchange_rate === null ? null : Number(linha.exchange_rate),
    valorEmBrl: Number(linha.amount_brl),
    recebidaEm: linha.received_at,
    registradaEm: linha.created_at,
    ativa: linha.is_active,
  }
}

export async function listarReceitas(filtro: FiltroDeReceitas): Promise<Receita[]> {
  const { data, error } = await supabase
    .from('income')
    .select(COLUNAS)
    .gte('received_at', inicioDoDia(filtro.de))
    .lt('received_at', inicioDoDiaSeguinte(filtro.ate))
    .order('received_at', { ascending: false })

  if (error) throw error
  return (data as LinhaDeReceita[]).map(paraReceita)
}

export async function criarReceita(rascunho: RascunhoDeReceita): Promise<Receita> {
  const { data, error } = await supabase
    .from('income')
    .insert(paraLinha(rascunho))
    .select(COLUNAS)
    .single()

  if (error) throw error
  return paraReceita(data as LinhaDeReceita)
}

export async function salvarReceita(id: number, rascunho: RascunhoDeReceita): Promise<Receita> {
  const { data, error } = await supabase
    .from('income')
    .update(paraLinha(rascunho))
    .eq('id', id)
    .select(COLUNAS)
    .single()

  if (error) throw error
  return paraReceita(data as LinhaDeReceita)
}

function paraLinha(rascunho: RascunhoDeReceita) {
  return {
    name: rascunho.nome.trim(),
    amount: rascunho.valor,
    currency: rascunho.moeda,
    exchange_rate: rascunho.cotacao,
    received_at: rascunho.recebidaEm,
  }
}

export async function removerReceita(id: number): Promise<void> {
  const { error } = await supabase.rpc('income_remove', { p_income_id: id })
  if (error) throw error
}

export function chaveDeErroDeReceita(falha: unknown): string {
  const erro = falha as { code?: string; message?: string } | null
  const raiz = 'income.errors'

  const mensagem = erro?.message ?? ''
  if (mensagem.includes('income_rate_required')) return `${raiz}.cotacaoObrigatoria`
  if (mensagem.includes('income_amount_out_of_range')) return `${raiz}.valorForaDeFaixa`
  if (mensagem.includes('income_not_found')) return `${raiz}.naoEncontrada`

  if (erro?.code === '23514') return `${raiz}.valorForaDeFaixa`

  return `${raiz}.desconhecido`
}

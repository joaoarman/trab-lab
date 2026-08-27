import { supabase } from '@/shared/lib/supabaseClient'
import type { AcaoDeRemocao, Categoria, ImpactoDeExclusao } from '@/shared/data/model'

const COLUNAS = 'id, parent_id, name, color, is_active, created_at'

interface LinhaDeCategoria {
  id: number
  parent_id: number | null
  name: string
  color: string
  is_active: boolean
  created_at: string
}

function paraCategoria(linha: LinhaDeCategoria): Categoria {
  return {
    id: linha.id,
    paiId: linha.parent_id,
    nome: linha.name,
    cor: linha.color,
    ativa: linha.is_active,
    criadaEm: linha.created_at,
  }
}

export async function listarCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from('category')
    .select(COLUNAS)
    .order('name', { ascending: true })

  if (error) throw error
  return (data as LinhaDeCategoria[]).map(paraCategoria)
}

export async function criarCategoria(
  nome: string,
  cor: string,
  paiId: number | null,
): Promise<Categoria> {
  const { data, error } = await supabase
    .from('category')
    .insert({ name: nome.trim(), color: cor, parent_id: paiId })
    .select(COLUNAS)
    .single()

  if (error) throw error
  return paraCategoria(data as LinhaDeCategoria)
}

export async function salvarCategoria(
  id: number,
  nome: string,
  cor: string,
): Promise<Categoria> {
  const { data, error } = await supabase
    .from('category')
    .update({ name: nome.trim(), color: cor })
    .eq('id', id)
    .select(COLUNAS)
    .single()

  if (error) throw error
  return paraCategoria(data as LinhaDeCategoria)
}

export async function preverRemocao(id: number): Promise<ImpactoDeExclusao> {
  const { data, error } = await supabase.rpc('category_impact', { p_category_id: id })
  if (error) throw error

  const [linha] = data as { descendants: number; records: number; action: string }[]
  return {
    descendentes: linha.descendants,
    registros: linha.records,
    acao: linha.action === 'delete' ? 'excluir' : 'desativar',
  }
}

export async function removerCategoria(id: number): Promise<AcaoDeRemocao> {
  const { data, error } = await supabase.rpc('category_remove', { p_category_id: id })
  if (error) throw error
  return data === 'deleted' ? 'excluir' : 'desativar'
}

export async function reativarCategoria(id: number): Promise<void> {
  const { error } = await supabase.rpc('category_reactivate', { p_category_id: id })
  if (error) throw error
}

export function chaveDeErroDeCategoria(falha: unknown): string {
  const erro = falha as { code?: string; message?: string } | null
  const raiz = 'categories.errors'

  if (erro?.code === '23505') return `${raiz}.nomeDuplicado`

  const mensagem = erro?.message ?? ''
  if (mensagem.includes('category_parent_deleted')) return `${raiz}.maeExcluida`
  if (mensagem.includes('category_cycle')) return `${raiz}.ciclo`
  if (mensagem.includes('category_not_found')) return `${raiz}.naoEncontrada`

  return `${raiz}.desconhecido`
}

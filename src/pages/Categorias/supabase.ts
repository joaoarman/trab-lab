import { supabase } from '@/shared/lib/supabaseClient'
import type { AcaoDeRemocao, Categoria, ImpactoDeExclusao } from '@/shared/data/model'

// =============================================================================
// Camada de dados do módulo Categorias.
//
// TODAS as queries do módulo vivem aqui — nenhuma tela chama o cliente Supabase
// direto. As funções RETORNAM tipos de domínio (src/shared/data/model.ts), nunca
// o objeto cru do Supabase: é a "costura" que permite trocar a API por baixo sem
// mexer em componente.
//
// Convenções:
//  • o banco fala snake_case, o app fala camelCase — a conversão acontece aqui,
//    numa função `para<Tipo>()` por entidade;
//  • nada de `select('*')`: liste as colunas, para o dia em que a tabela ganhar
//    uma coluna pesada ou sensível;
//  • o filtro por dono NÃO é escrito na query — quem garante isso é a RLS
//    (`auth.uid()`), no banco. Ver o modelo de acesso do projeto.
//
// ## O que este arquivo NÃO faz
//
// `is_active` e `deleted_at` não aparecem em nenhum `update` daqui, e não é
// esquecimento: o cliente **não tem grant** nessas duas colunas. Desativar,
// excluir e reativar passam obrigatoriamente pelas RPCs do fim do arquivo, que
// rodam no banco e aplicam a regra inteira de uma vez. Assim a regra de negócio
// mais delicada do módulo não depende de a tela lembrar de aplicá-la.
//
// O schema deste módulo vive em supabase/migrations/ e supabase/schema/.
// =============================================================================

/** Colunas lidas da `category`. `deleted_at` não entra: a RLS já filtra. */
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

/**
 * Todas as categorias vivas do usuário — ativas **e** desativadas, numa lista
 * plana.
 *
 * As desativadas vêm juntas de propósito: elas não somem da tela, vão para o
 * submenu "Desativadas". Quem separa as duas é `arvore.ts`, e uma busca só evita
 * o descompasso de duas requisições que voltam em momentos diferentes.
 *
 * A ordenação é por nome, e é ela que ordena a árvore inteira: `montarArvore`
 * preserva a ordem de chegada dentro de cada nível.
 */
export async function listarCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from('category')
    .select(COLUNAS)
    .order('name', { ascending: true })

  if (error) throw error
  return (data as LinhaDeCategoria[]).map(paraCategoria)
}

/**
 * Cria uma categoria. `paiId` nulo = categoria de topo.
 *
 * O `profile_id` **não** é enviado: ele é preenchido pelo DEFAULT
 * `current_profile_id()` no banco, e o cliente sequer tem grant na coluna —
 * então não há como criar categoria no nome de outra pessoa.
 */
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

/** Renomeia / repinta uma categoria. Não move (não mexe em `parent_id`). */
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

/**
 * O que **aconteceria** ao remover esta categoria agora.
 *
 * Serve à modal de confirmação: é com esta resposta que ela escreve "esta
 * categoria será excluída" ou "ela e as 3 subcategorias serão desativadas", em
 * vez de um texto genérico que valeria para os dois casos e não avisaria nada.
 */
export async function preverRemocao(id: number): Promise<ImpactoDeExclusao> {
  const { data, error } = await supabase.rpc('category_impact', { p_category_id: id })
  if (error) throw error

  // `returns table` sempre volta como lista, mesmo com uma linha só.
  const [linha] = data as { descendants: number; records: number; action: string }[]
  return {
    descendentes: linha.descendants,
    registros: linha.records,
    acao: linha.action === 'delete' ? 'excluir' : 'desativar',
  }
}

/**
 * Remove a categoria — excluindo, ou desativando quando excluir não é possível.
 *
 * **A decisão é do banco, não desta função.** Devolve o que de fato aconteceu, e
 * é esse retorno que a tela anuncia: se um gasto for lançado nessa categoria
 * entre a abertura da modal e o clique em confirmar, o certo passa a ser
 * desativar — e é isso que a pessoa vai ler.
 */
export async function removerCategoria(id: number): Promise<AcaoDeRemocao> {
  const { data, error } = await supabase.rpc('category_remove', { p_category_id: id })
  if (error) throw error
  return data === 'deleted' ? 'excluir' : 'desativar'
}

/**
 * Traz uma categoria desativada de volta.
 *
 * Volta a subárvore inteira (foi assim que ela saiu) **e** a cadeia de mães —
 * senão a categoria "voltaria" pendurada numa mãe inativa, que não é desenhada
 * na árvore principal: reativada e ainda assim invisível.
 */
export async function reativarCategoria(id: number): Promise<void> {
  const { error } = await supabase.rpc('category_reactivate', { p_category_id: id })
  if (error) throw error
}

/**
 * O erro do Postgres → a chave de i18n que a tela mostra.
 *
 * Mora aqui, e não num componente, pelo mesmo motivo das queries: os códigos e
 * as mensagens do banco são conhecimento da camada de dados. Uma tela que
 * lê `error.code === '23505'` amarra o componente ao PostgreSQL, que é
 * exatamente o que este arquivo existe para evitar.
 *
 * O espelho disto para o login é `src/shared/lib/authErrors.ts`.
 */
export function chaveDeErroDeCategoria(falha: unknown): string {
  const erro = falha as { code?: string; message?: string } | null
  const raiz = 'categories.errors'

  // 23505 = unique_violation → o índice category_sibling_name_uk.
  if (erro?.code === '23505') return `${raiz}.nomeDuplicado`

  // As exceções levantadas de propósito pelas guardas e pelas RPCs. Todas
  // chegam como P0001 (raise_exception), então quem as distingue é a mensagem.
  const mensagem = erro?.message ?? ''
  if (mensagem.includes('category_parent_deleted')) return `${raiz}.maeExcluida`
  if (mensagem.includes('category_cycle')) return `${raiz}.ciclo`
  if (mensagem.includes('category_not_found')) return `${raiz}.naoEncontrada`

  return `${raiz}.desconhecido`
}

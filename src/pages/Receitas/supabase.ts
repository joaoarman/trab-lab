import { supabase } from '@/shared/lib/supabaseClient'
import type { FiltroDeReceitas, Moeda, RascunhoDeReceita, Receita } from '@/shared/data/model'
import { inicioDoDia, inicioDoDiaSeguinte } from '@/shared/utils/datas'

// =============================================================================
// Camada de dados do módulo Receitas.
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
// **Não converte dólar em real.** `amount_brl` não aparece em nenhum insert nem
// update daqui, e não é esquecimento: o cliente **não tem grant** nessa coluna.
// Quem multiplica valor por cotação é a trigger `income_guard`, no banco. Se a
// conta morasse aqui, bastaria uma versão antiga do app ou uma chamada direta à
// API REST para o extrato passar a mentir — e mentir de um jeito invisível,
// porque cada linha continuaria parecendo normal.
//
// **Não escreve `created_at`.** A tela EXIBE "registrada em", e essa coluna só
// serve para isso enquanto o cliente não puder mexer nela: com grant de escrita,
// daria para antedatar o próprio registro. Ela é lida, nunca enviada.
//
// `is_active` e `deleted_at` seguem a mesma regra: excluir passa obrigatoriamente
// pela RPC `income_remove`, que é `security definer`. Sem esse recorte, um
// `update` pela API REST poderia RESSUSCITAR uma receita excluída, e a exclusão
// viraria uma sugestão.
//
// O schema deste módulo vive em supabase/migrations/ e supabase/schema/.
// =============================================================================

/** Colunas lidas da `income`. `deleted_at` não entra: a RLS já filtra. */
const COLUNAS =
  'id, name, amount, currency, exchange_rate, amount_brl, received_at, is_active, created_at'

interface LinhaDeReceita {
  id: number
  name: string
  // Os três são `numeric` no banco, e o PostgREST devolve numeric como TEXTO
  // ('500.00'), não como número: é assim que o Postgres protege a precisão que o
  // `float` do JSON perderia. Quem converte é `paraReceita`, na fronteira.
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
    // A conversão dos `numeric` acontece aqui, na fronteira, para que nenhum
    // componente receba um "número" que às vezes é string. Ela é segura: são no
    // máximo 9 dígitos significativos, bem dentro do que o `number` representa
    // sem perda. O que NÃO se faz no cliente é acumular somas assim — para isso
    // existe `somar` (`shared/utils/dinheiro.ts`).
    valor: Number(linha.amount),
    moeda: linha.currency,
    cotacao: linha.exchange_rate === null ? null : Number(linha.exchange_rate),
    valorEmBrl: Number(linha.amount_brl),
    recebidaEm: linha.received_at,
    registradaEm: linha.created_at,
    ativa: linha.is_active,
  }
}

/**
 * As receitas do período, da mais recente para a mais antiga.
 *
 * Ordena por `received_at`, e não por `created_at`: a lista é o extrato do que
 * **entrou**, não o histórico de quando alguém digitou. Lançar na segunda o
 * salário que caiu na sexta tem de colocá-lo na sexta.
 *
 * ## O recorte do período é fechado nas duas pontas, e inclui o dia inteiro
 *
 * O filtro chega como duas datas (`2026-08-01`, `2026-08-31`), mas a coluna tem
 * **hora**. Quem faz a ponte é `inicioDoDia`/`inicioDoDiaSeguinte`
 * (`shared/utils/datas.ts`), no fuso do usuário — a explicação de por que o fim
 * do período vira o começo do dia seguinte está lá.
 *
 * ## Sem filtro de categoria
 *
 * É a diferença desta função para a irmã de Gastos, e ela vem do banco: `income`
 * não tem `category_id`. Não há subárvore a percorrer, então
 * a tela também não precisa carregar as categorias para filtrar.
 */
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

/**
 * Cria uma receita.
 *
 * O `profile_id` **não** é enviado: ele é preenchido pelo DEFAULT
 * `current_profile_id()` no banco, e o cliente sequer tem grant na coluna — então
 * não há como lançar uma receita no nome de outra pessoa.
 *
 * A `cotacao` vai como está: nula em real, preenchida em dólar. O banco recusa a
 * segunda combinação errada (moeda estrangeira sem cotação) e limpa a primeira
 * (real com cotação), então a tela não precisa policiar isso.
 */
export async function criarReceita(rascunho: RascunhoDeReceita): Promise<Receita> {
  const { data, error } = await supabase
    .from('income')
    .insert(paraLinha(rascunho))
    .select(COLUNAS)
    .single()

  if (error) throw error
  return paraReceita(data as LinhaDeReceita)
}

/** Salva as alterações de uma receita. Os mesmos campos do formulário de criar. */
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

/**
 * O rascunho do app → as colunas em que o cliente tem grant de escrita.
 *
 * `created_at` não está aqui de propósito: editar uma receita muda quando ela foi
 * recebida, nunca quando ela foi registrada. A data de registro é um fato do
 * sistema, e continua sendo a do primeiro `insert`.
 */
function paraLinha(rascunho: RascunhoDeReceita) {
  return {
    name: rascunho.nome.trim(),
    amount: rascunho.valor,
    currency: rascunho.moeda,
    exchange_rate: rascunho.cotacao,
    received_at: rascunho.recebidaEm,
  }
}

/**
 * Exclui uma receita — soft-delete, no banco.
 *
 * A linha continua lá, com `deleted_at` preenchido, e some da RLS: para o app,
 * deixou de existir. É uma RPC porque o cliente não tem grant em `deleted_at` —
 * com grant, o mesmo `update` que exclui poderia desfazer a exclusão.
 */
export async function removerReceita(id: number): Promise<void> {
  const { error } = await supabase.rpc('income_remove', { p_income_id: id })
  if (error) throw error
}

/**
 * O erro do Postgres → a chave de i18n que a tela mostra.
 *
 * Mora aqui, e não num componente, pelo mesmo motivo das queries: os códigos e as
 * mensagens do banco são conhecimento da camada de dados. Uma tela que lê
 * `error.code` amarra o componente ao PostgreSQL, que é exatamente o que este
 * arquivo existe para evitar.
 *
 * O espelho disto está em `pages/Gastos/supabase.ts` e, para o login, em
 * `shared/lib/authErrors.ts`.
 */
export function chaveDeErroDeReceita(falha: unknown): string {
  const erro = falha as { code?: string; message?: string } | null
  const raiz = 'income.errors'

  // As exceções levantadas de propósito pela guarda e pela RPC. Todas chegam como
  // P0001 (raise_exception), então quem as distingue é a mensagem.
  const mensagem = erro?.message ?? ''
  if (mensagem.includes('income_rate_required')) return `${raiz}.cotacaoObrigatoria`
  if (mensagem.includes('income_amount_out_of_range')) return `${raiz}.valorForaDeFaixa`
  if (mensagem.includes('income_not_found')) return `${raiz}.naoEncontrada`

  // 23514 = check_violation. Na prática é sempre a faixa do valor: as outras
  // checks (coerência do trio moeda/cotação/reais) são preenchidas pela trigger
  // antes de serem verificadas, então a tela não consegue violá-las.
  if (erro?.code === '23514') return `${raiz}.valorForaDeFaixa`

  return `${raiz}.desconhecido`
}

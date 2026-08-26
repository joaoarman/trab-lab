import { supabase } from '@/shared/lib/supabaseClient'
import type { Categoria, FiltroDeGastos, Gasto, Moeda, RascunhoDeGasto } from '@/shared/data/model'
import { idsDaSubarvore } from '@/shared/data/arvoreDeCategorias'

// =============================================================================
// Camada de dados do módulo Gastos.
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
// Quem multiplica valor por cotação é a trigger `expense_guard`, no banco. Se a conta morasse aqui, bastaria uma versão antiga do app ou uma
// chamada direta à API REST para o extrato passar a mentir — e mentir de um jeito
// invisível, porque cada linha continuaria parecendo normal.
//
// `is_active` e `deleted_at` seguem a mesma regra: excluir passa obrigatoriamente
// pela RPC `expense_remove`, que é `security definer`. Sem esse recorte, um
// `update` pela API REST poderia RESSUSCITAR um gasto excluído, e a exclusão
// viraria uma sugestão.
//
// O schema deste módulo vive em supabase/migrations/ e supabase/schema/.
// =============================================================================

/** Colunas lidas da `expense`. `deleted_at` não entra: a RLS já filtra. */
const COLUNAS =
  'id, category_id, name, amount, currency, exchange_rate, amount_brl, occurred_at, is_active, created_at'

interface LinhaDeGasto {
  id: number
  category_id: number | null
  name: string
  // Os três são `numeric` no banco, e o PostgREST devolve numeric como TEXTO
  // ('50.00'), não como número: é assim que o Postgres protege a precisão que o
  // `float` do JSON perderia. Quem converte é `paraGasto`, na fronteira.
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
    // A conversão dos `numeric` acontece aqui, na fronteira, para que nenhum
    // componente receba um "número" que às vezes é string. Ela é segura: são no
    // máximo 9 dígitos significativos, bem dentro do que o `number` representa
    // sem perda. O que NÃO se faz no cliente é acumular somas assim — para isso
    // existe `somar` (`shared/utils/dinheiro.ts`).
    valor: Number(linha.amount),
    moeda: linha.currency,
    cotacao: linha.exchange_rate === null ? null : Number(linha.exchange_rate),
    valorEmBrl: Number(linha.amount_brl),
    ocorreuEm: linha.occurred_at,
    ativo: linha.is_active,
    criadoEm: linha.created_at,
  }
}

/**
 * Os gastos do período, do mais recente para o mais antigo.
 *
 * ## O recorte do período é fechado nas duas pontas, e inclui o dia inteiro
 *
 * O filtro chega como duas datas (`2026-08-01`, `2026-08-31`), mas a coluna tem
 * **hora**. Comparar `occurred_at <= '2026-08-31'` deixaria de fora tudo o que
 * aconteceu depois da meia-noite daquele dia — ou seja, o último dia do mês
 * inteiro, silenciosamente. Por isso o fim vira o **começo do dia seguinte**, e a
 * comparação é `<`.
 *
 * ## Filtrar por uma categoria traz os descendentes junto
 *
 * "Quanto gastei com Carro?" tem de somar `Carro › Gasolina` e `Carro › Seguro`
 * também — quem registra escolhe a folha, então filtrar só pelo id exato quase
 * sempre devolveria zero. Os ids da subárvore são calculados no cliente
 * (`idsDaSubarvore`), a partir da lista de categorias que a tela já carregou:
 * assim trocar o seletor não custa uma ida ao servidor só para descobrir quem
 * são as filhas.
 */
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

/**
 * As categorias, para o seletor do formulário e para o filtro da lista.
 *
 * Sim, o módulo Categorias tem a sua própria `listarCategorias()`. A consulta é
 * repetida aqui de propósito: a convenção do projeto é que **todas as queries de
 * um módulo vivem no `supabase.ts` dele**, para que mexer em Gastos não exija ler
 * o código de outra tela. O que NÃO se repete é a regra — a travessia da árvore
 * (quem é filha de quem, o caminho até a raiz) mora num lugar só, em
 * `shared/data/arvoreDeCategorias.ts`, e é lá que a lógica de verdade está.
 *
 * As **desativadas vêm junto**: um gasto antigo pode apontar para uma categoria
 * que saiu da árvore depois, e sem ela na lista a linha do extrato apareceria
 * como "Sem categoria" — o gasto estaria classificado no banco e mentiria na
 * tela. Quem tira as desativadas do seletor de gasto novo é `achatarArvore`.
 */
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

/**
 * Cria um gasto.
 *
 * O `profile_id` **não** é enviado: ele é preenchido pelo DEFAULT
 * `current_profile_id()` no banco, e o cliente sequer tem grant na coluna — então
 * não há como lançar um gasto no nome de outra pessoa.
 *
 * A `cotacao` vai como está: nula em real, preenchida em dólar. O banco recusa a
 * segunda combinação errada (moeda estrangeira sem cotação) e limpa a primeira
 * (real com cotação), então a tela não precisa policiar isso.
 */
export async function criarGasto(rascunho: RascunhoDeGasto): Promise<Gasto> {
  const { data, error } = await supabase
    .from('expense')
    .insert(paraLinha(rascunho))
    .select(COLUNAS)
    .single()

  if (error) throw error
  return paraGasto(data as LinhaDeGasto)
}

/** Salva as alterações de um gasto. Os mesmos campos do formulário de criar. */
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

/** O rascunho do app → as colunas em que o cliente tem grant de escrita. */
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

/**
 * Exclui um gasto — soft-delete, no banco.
 *
 * A linha continua lá, com `deleted_at` preenchido, e some da RLS: para o app,
 * deixou de existir. É uma RPC porque o cliente não tem grant em `deleted_at` —
 * com grant, o mesmo `update` que exclui poderia desfazer a exclusão.
 */
export async function removerGasto(id: number): Promise<void> {
  const { error } = await supabase.rpc('expense_remove', { p_expense_id: id })
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
 * O espelho disto está em `pages/Categorias/supabase.ts` e, para o login, em
 * `shared/lib/authErrors.ts`.
 */
export function chaveDeErroDeGasto(falha: unknown): string {
  const erro = falha as { code?: string; message?: string } | null
  const raiz = 'expenses.errors'

  // As exceções levantadas de propósito pela guarda e pela RPC. Todas chegam como
  // P0001 (raise_exception), então quem as distingue é a mensagem.
  const mensagem = erro?.message ?? ''
  if (mensagem.includes('expense_rate_required')) return `${raiz}.cotacaoObrigatoria`
  if (mensagem.includes('expense_amount_out_of_range')) return `${raiz}.valorForaDeFaixa`
  if (mensagem.includes('expense_category_not_found')) return `${raiz}.categoriaNaoEncontrada`
  if (mensagem.includes('expense_not_found')) return `${raiz}.naoEncontrado`

  // 23514 = check_violation. Na prática é sempre a faixa do valor: as outras
  // checks (coerência do trio moeda/cotação/reais) são preenchidas pela trigger
  // antes de serem verificadas, então a tela não consegue violá-las.
  if (erro?.code === '23514') return `${raiz}.valorForaDeFaixa`

  return `${raiz}.desconhecido`
}

// --- O período, em ISO ------------------------------------------------------
//
// O `<input type="date">` entrega 'YYYY-MM-DD', e a coluna do banco é
// `timestamptz`. As duas funções abaixo fazem a ponte NO FUSO DO USUÁRIO: `new
// Date(2026, 7, 1)` monta a meia-noite local, e `toISOString()` a converte para
// UTC na hora de mandar. Escrever a string à mão ('2026-08-01T00:00:00Z')
// entregaria a meia-noite de Londres, e quem está em Brasília perderia as três
// primeiras horas do primeiro dia do filtro.

function inicioDoDia(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia).toISOString()
}

/**
 * O começo do dia seguinte — o limite ABERTO do filtro.
 *
 * É o que faz o último dia do período entrar inteiro. `new Date(ano, mes, dia +
 * 1)` com o dia 31 vira o dia 1 do mês que vem sozinho: o construtor normaliza o
 * estouro, e não é preciso saber quantos dias tem o mês nem se o ano é bissexto.
 */
function inicioDoDiaSeguinte(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia + 1).toISOString()
}

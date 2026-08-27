import { supabase } from '@/shared/lib/supabaseClient'
import type { ConsumoDeIA, MensagemDaIA, RecorteDePeriodo } from '@/shared/data/model'
import { COLUNAS_DA_MENSAGEM, paraMensagem, type LinhaDeAiLog } from '@/shared/data/aiLog'
import { inicioDoDia, inicioDoDiaSeguinte } from '@/shared/utils/datas'

// =============================================================================
// Camada de dados do módulo Log da IA.
//
// TODAS as queries do módulo vivem aqui — nenhuma tela chama o cliente Supabase
// direto. As funções RETORNAM tipos de domínio (src/shared/data/model.ts), nunca
// o objeto cru do Supabase.
//
// ## Este módulo é SÓ LEITURA — e não é uma limitação, é o desenho
//
// Não há insert, update nem delete aqui, e não existe grant nenhum de escrita em
// `public.ai_log` para o cliente. Um log que a pessoa auditada consegue editar não
// audita nada: bastaria um `update` pela API REST para uma chamada cara sumir do
// relatório, ou para uma resposta da IA ser reescrita depois do fato.
//
// Quem escreve é a Edge Function `chat`, pela RPC `ai_log_add_turn`. A única
// escrita que o usuário alcança é `chat_clear` (o "limpar conversa"), e ela mora
// em `pages/Chat/supabase.ts` porque é ação do Chat — e, de propósito, ela **não
// apaga nada aqui**: as mensagens limpas continuam nesta tela, com o custo.
//
// ## Mesma tabela do Chat, recortes diferentes
//
// O Chat lê `is_active = true` e pagina por id (é a conversa). Este módulo lê
// TUDO, por período, e mostra as colunas que a conversa não mostra: modelo,
// tokens, custo e as ferramentas executadas. A tradução da linha é compartilhada
// (`shared/data/aiLog.ts`) — o porquê está lá.
//
// O schema deste módulo vive em supabase/migrations/ e supabase/schema/.
// =============================================================================

/**
 * Quantas linhas a tela lista por vez.
 *
 * A lista é uma amostra do período; os TOTAIS não saem dela, saem de
 * `consumoDoPeriodo()`, que soma no banco. É a diferença que impede o rodapé de
 * mentir quando o mês tem mais mensagens do que a página mostra.
 */
export const TAMANHO_DA_PAGINA = 50

/**
 * As mensagens do período, da mais recente para a mais antiga.
 *
 * `antesDe` é o id a partir do qual buscar para trás — o "carregar mais" do fim da
 * lista. Paginar por **id**, e não por data, pelo mesmo motivo do Chat: a pergunta
 * e a resposta de um turno nascem no mesmo `now()`, e uma paginação por
 * `created_at` poderia repetir ou pular uma das duas na virada da página.
 *
 * Os limites do período saem de `shared/utils/datas.ts`, no fuso de quem está
 * olhando: o filtro entrega duas datas (`2026-08-01`, `2026-08-31`) e a coluna tem
 * hora, então o fim vira o **começo do dia seguinte** e a comparação é `<`. Sem
 * isso, o último dia do recorte ficaria de fora inteiro, em silêncio.
 */
export async function listarMensagens(
  recorte: RecorteDePeriodo,
  antesDe?: number,
): Promise<MensagemDaIA[]> {
  let consulta = supabase
    .from('ai_log')
    .select(COLUNAS_DA_MENSAGEM)
    .gte('created_at', inicioDoDia(recorte.de))
    .lt('created_at', inicioDoDiaSeguinte(recorte.ate))
    .order('id', { ascending: false })
    .limit(TAMANHO_DA_PAGINA)

  if (antesDe !== undefined) consulta = consulta.lt('id', antesDe)

  const { data, error } = await consulta
  if (error) throw error

  return (data as unknown as LinhaDeAiLog[]).map(paraMensagem)
}

/**
 * O consumo do período: mensagens, custo e tokens.
 *
 * Sai de uma RPC (`ai_log_report`), e não de uma soma sobre a lista da tela, por
 * uma razão só: **a lista é paginada**. Somar a página visível daria um número
 * menor que a verdade, com cara de resposta certa — que é exatamente o defeito que
 * uma tela de auditoria não pode ter.
 *
 * A soma acontece no Postgres, em `numeric`, e não em JavaScript: o custo de uma
 * mensagem tem seis casas decimais, e somar centenas delas em ponto flutuante
 * acumularia erro.
 */
export async function consumoDoPeriodo(recorte: RecorteDePeriodo): Promise<ConsumoDeIA> {
  const { data, error } = await supabase.rpc('ai_log_report', {
    p_from: inicioDoDia(recorte.de),
    p_to: inicioDoDiaSeguinte(recorte.ate),
  })
  if (error) throw error

  // `returns table` volta como lista, mesmo com uma linha só.
  const [linha] = (data ?? []) as {
    messages: number
    cost_usd_cents: number | string
    tokens_input: number
    tokens_output: number
  }[]

  return {
    mensagens: linha?.messages ?? 0,
    custoEmCentavosDeDolar: Number(linha?.cost_usd_cents ?? 0),
    tokensEntrada: linha?.tokens_input ?? 0,
    tokensSaida: linha?.tokens_output ?? 0,
  }
}

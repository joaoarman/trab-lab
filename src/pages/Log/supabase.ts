import { supabase } from '@/shared/lib/supabaseClient'
import type { ConsumoDeIA, MensagemDaIA, RecorteDePeriodo } from '@/shared/data/model'
import { COLUNAS_DA_MENSAGEM, paraMensagem, type LinhaDeAiLog } from '@/shared/data/aiLog'
import { inicioDoDia, inicioDoDiaSeguinte } from '@/shared/utils/datas'

export const TAMANHO_DA_PAGINA = 50

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

export async function consumoDoPeriodo(recorte: RecorteDePeriodo): Promise<ConsumoDeIA> {
  const { data, error } = await supabase.rpc('ai_log_report', {
    p_from: inicioDoDia(recorte.de),
    p_to: inicioDoDiaSeguinte(recorte.ate),
  })
  if (error) throw error

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

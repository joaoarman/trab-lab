import type {
  FerramentaExecutada,
  MensagemDaIA,
  OrigemDaMensagem,
  PapelNaConversa,
  ReciboDeRegistro,
  TipoDeResposta,
} from './model'

export const COLUNAS_DA_MENSAGEM =
  'id, role, content, source, kind, receipts, tool_calls, ai_model, ' +
  'tokens_input, tokens_input_cached, tokens_output, cost_usd_cents, is_active, created_at'

export interface LinhaDeAiLog {
  id: number
  role: string
  content: string
  source: string
  kind: string
  receipts: unknown
  tool_calls: unknown
  ai_model: string | null
  tokens_input: number | null
  tokens_input_cached: number | null
  tokens_output: number | null
  // numeric chega como texto no PostgREST
  cost_usd_cents: number | string | null
  is_active: boolean
  created_at: string
}

function paraNumero(valor: number | string | null): number | null {
  return valor === null ? null : Number(valor)
}

function paraLista<T>(valor: unknown): T[] {
  return Array.isArray(valor) ? (valor as T[]) : []
}

export function paraMensagem(linha: LinhaDeAiLog): MensagemDaIA {
  return {
    id: linha.id,
    papel: (linha.role === 'USER' ? 'USER' : 'ASSISTANT') as PapelNaConversa,
    conteudo: linha.content,
    origem: (linha.source === 'AUDIO' ? 'AUDIO' : 'TEXT') as OrigemDaMensagem,
    tipo: (linha.kind === 'REFUSAL' ? 'REFUSAL' : 'MESSAGE') as TipoDeResposta,
    recibos: paraLista<ReciboDeRegistro>(linha.receipts),
    ferramentas: paraLista<FerramentaExecutada>(linha.tool_calls),
    modelo: linha.ai_model,
    tokensEntrada: linha.tokens_input,
    tokensEntradaCacheados: linha.tokens_input_cached,
    tokensSaida: linha.tokens_output,
    custoEmCentavosDeDolar: paraNumero(linha.cost_usd_cents),
    naConversa: linha.is_active,
    criadaEm: linha.created_at,
  }
}

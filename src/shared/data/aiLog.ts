// =============================================================================
// A tradução da linha de `public.ai_log` → `MensagemDaIA`.
//
// ## Por que isto mora em `shared/data` e não no `supabase.ts` de um módulo
//
// A convenção do projeto é que toda query de um módulo viva no `supabase.ts`
// dele, e ela continua valendo: as **queries** do Chat estão em
// `pages/Chat/supabase.ts` e as do Log em `pages/Log/supabase.ts`, cada uma com o
// seu recorte. O que sobe para cá é a **conversão**, porque as duas leem a MESMA
// tabela e a mesma linha.
//
// Duas cópias da conversão significariam duas listas de colunas e dois mapeadores
// para uma linha só — e eles divergiriam no dia em que a tabela ganhasse uma
// coluna: o Chat passaria a mostrar o campo novo e o Log não, ou o contrário, sem
// nenhum erro de compilação para avisar.
//
// É a mesma razão de `arvoreDeCategorias.ts` e `extrato.ts` morarem aqui: a regra
// é do dado, não da tela.
// =============================================================================
import type {
  FerramentaExecutada,
  MensagemDaIA,
  OrigemDaMensagem,
  PapelNaConversa,
  ReciboDeRegistro,
  TipoDeResposta,
} from './model'

/**
 * As colunas lidas de `ai_log` — as mesmas para as duas telas.
 *
 * Nada de `select('*')`: a lista existe para o dia em que a tabela ganhar uma
 * coluna pesada. `profile_id` não entra (a RLS já resolve de quem é a linha) e
 * `is_active` entra porque o Log **exibe** a diferença: uma mensagem limpa da
 * conversa continua no relatório de custo.
 */
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
  /** `numeric` do Postgres pode chegar como string — ver `paraNumero`. */
  cost_usd_cents: number | string | null
  is_active: boolean
  created_at: string
}

/**
 * `numeric` → `number`, preservando o null.
 *
 * O PostgREST devolve `numeric` como TEXTO ('0.041300'): é assim que o Postgres
 * protege a precisão que o float do JSON perderia. Null passa adiante como null —
 * "não houve chamada de IA" nunca é "custou zero", e a soma do período depende
 * dessa distinção para não diluir a média com mensagens digitadas.
 */
function paraNumero(valor: number | string | null): number | null {
  return valor === null ? null : Number(valor)
}

/**
 * O `jsonb` do banco → um array tipado, com o mínimo de confiança possível.
 *
 * A checagem existe porque o conteúdo dessas colunas foi montado por uma Edge
 * Function a partir do que um modelo de linguagem pediu. O banco garante que é um
 * array (`ai_log_receipts_is_array`), mas o formato de cada item é convenção — e
 * uma convenção que mudou entre versões deixaria linhas antigas com outro
 * formato. Um `null` ou um objeto solto vira lista vazia em vez de derrubar a
 * tela inteira por causa de uma bolha de meses atrás.
 */
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

import { supabase } from '@/shared/lib/supabaseClient'
import type { MensagemDaIA, OrigemDaMensagem } from '@/shared/data/model'
import { COLUNAS_DA_MENSAGEM, paraMensagem, type LinhaDeAiLog } from '@/shared/data/aiLog'

export type CodigoDeErroDoChat =
  | 'ai_not_configured'
  | 'ai_rate_limited'
  | 'ai_failed'
  | 'transcription_failed'
  | 'audio_too_large'
  | 'save_failed'
  | 'unknown'

export class ErroDoChat extends Error {
  constructor(readonly codigo: CodigoDeErroDoChat) {
    super(codigo)
    this.name = 'ErroDoChat'
  }
}

export function codigoDeErroDoChat(falha: unknown): CodigoDeErroDoChat {
  return falha instanceof ErroDoChat ? falha.codigo : 'unknown'
}

async function codigoDaResposta(falha: unknown): Promise<CodigoDeErroDoChat> {
  const resposta = (falha as { context?: Response } | null)?.context
  if (!(resposta instanceof Response)) return 'unknown'

  try {
    const corpo = (await resposta.clone().json()) as { error?: string }
    const conhecidos: CodigoDeErroDoChat[] = [
      'ai_not_configured',
      'ai_rate_limited',
      'ai_failed',
      'audio_too_large',
      'save_failed',
    ]
    const encontrado = conhecidos.find((codigo) => codigo === corpo.error)
    if (encontrado) return encontrado

    if (corpo.error === 'ai_empty') return 'ai_failed'
  } catch {
    // corpo sem JSON: fica em 'unknown'
  }

  return 'unknown'
}

export const TAMANHO_DA_PAGINA = 40

export async function listarMensagens(antesDe?: number): Promise<MensagemDaIA[]> {
  let consulta = supabase
    .from('ai_log')
    .select(COLUNAS_DA_MENSAGEM)
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(TAMANHO_DA_PAGINA)

  if (antesDe !== undefined) consulta = consulta.lt('id', antesDe)

  const { data, error } = await consulta
  if (error) throw new ErroDoChat('unknown')

  return (data as unknown as LinhaDeAiLog[]).map(paraMensagem).reverse()
}

export interface ExtratoDeIA {
  custoEmCentavos: number | null
  tokensEntrada: number | null
  tokensSaida: number | null
}

export async function enviarMensagem(entrada: {
  texto: string
  origem: OrigemDaMensagem
  hoje: string
  diaDaSemana: string
  fusoEmMinutos: number
  idioma: string
  transcricao?: ExtratoDeIA | null
}): Promise<MensagemDaIA[]> {
  const { data, error } = await supabase.functions.invoke('chat', {
    method: 'POST',
    body: {
      mensagem: entrada.texto,
      origem: entrada.origem,
      hoje: entrada.hoje,
      diaDaSemana: entrada.diaDaSemana,
      fusoEmMinutos: entrada.fusoEmMinutos,
      idioma: entrada.idioma,
      iaDaTranscricao: entrada.transcricao
        ? {
            custo: entrada.transcricao.custoEmCentavos,
            tokensEntrada: entrada.transcricao.tokensEntrada,
            tokensSaida: entrada.transcricao.tokensSaida,
          }
        : null,
    },
  })

  if (error) throw new ErroDoChat(await codigoDaResposta(error))

  const linhas = (data as { mensagens?: LinhaDeAiLog[] } | null)?.mensagens
  if (!linhas?.length) throw new ErroDoChat('ai_failed')

  return linhas.map(paraMensagem)
}

function extensaoDe(mimeType: string): string {
  const formato = mimeType.split(';')[0].split('/')[1] ?? ''
  const conhecidos = ['webm', 'mp4', 'mpeg', 'mp3', 'ogg', 'wav', 'm4a']
  return conhecidos.includes(formato) ? formato : 'webm'
}

export interface Transcricao {
  texto: string
  ia: ExtratoDeIA
}

export async function transcreverAudio(audio: Blob): Promise<Transcricao> {
  const formulario = new FormData()
  formulario.append('audio', audio, `audio.${extensaoDe(audio.type)}`)

  const { data, error } = await supabase.functions.invoke('transcribe', {
    method: 'POST',
    body: formulario,
  })

  if (error) {
    const codigo = await codigoDaResposta(error)
    throw new ErroDoChat(codigo === 'unknown' ? 'transcription_failed' : codigo)
  }

  const corpo = data as
    | {
        texto?: string
        ia?: { custo?: number | null; tokensEntrada?: number | null; tokensSaida?: number | null }
      }
    | null

  const numero = (valor: unknown): number | null => (typeof valor === 'number' ? valor : null)

  return {
    texto: (corpo?.texto ?? '').trim(),
    ia: {
      custoEmCentavos: numero(corpo?.ia?.custo),
      tokensEntrada: numero(corpo?.ia?.tokensEntrada),
      tokensSaida: numero(corpo?.ia?.tokensSaida),
    },
  }
}

export async function limparConversa(): Promise<void> {
  const { error } = await supabase.rpc('chat_clear')
  if (error) throw new ErroDoChat('unknown')
}

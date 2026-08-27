import {
  MODELO_TRANSCRICAO,
  PROMPT_TRANSCRICAO,
  custoDaTranscricaoEmCentavos,
} from '../chat/prompts.ts'
import type { UsoDaTranscricao } from '../chat/prompts.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions'

const MAX_BYTES = 10 * 1024 * 1024

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  if (!request.headers.get('Authorization')) return json({ error: 'missing_token' }, 401)

  const chave = Deno.env.get('OPENAI_API_KEY_TRANSCRIPTION')
  if (!chave) return json({ error: 'ai_not_configured' }, 503)

  let audio: File | null = null
  try {
    const formulario = await request.formData()
    const arquivo = formulario.get('audio')
    if (arquivo instanceof File) audio = arquivo
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  if (!audio) return json({ error: 'missing_audio' }, 400)
  if (audio.size === 0) return json({ error: 'empty_audio' }, 400)
  if (audio.size > MAX_BYTES) return json({ error: 'audio_too_large' }, 413)

  const envio = new FormData()
  envio.append('file', audio, audio.name || 'audio.webm')
  envio.append('model', MODELO_TRANSCRICAO)
  envio.append('language', 'pt')
  envio.append('prompt', PROMPT_TRANSCRICAO)
  envio.append('response_format', 'json')

  const chamada = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}` },
    body: envio,
  })

  if (!chamada.ok) {
    console.error('openai/transcribe', chamada.status, await chamada.text())
    return json({ error: chamada.status === 429 ? 'ai_rate_limited' : 'ai_failed' }, 502)
  }

  const dados = await chamada.json()
  const texto = (dados.text ?? '').trim()

  const bruto = dados.usage as
    | {
        type?: string
        seconds?: number
        input_tokens?: number
        output_tokens?: number
        input_token_details?: { audio_tokens?: number; text_tokens?: number }
      }
    | undefined

  let uso: UsoDaTranscricao | null = null
  if (bruto?.type === 'duration' || typeof bruto?.seconds === 'number') {
    uso = { segundos: bruto.seconds }
  } else if (bruto) {
    const tokensDeAudio = bruto.input_token_details?.audio_tokens
    const tokensDeTexto = bruto.input_token_details?.text_tokens
    uso = {
      audio: tokensDeAudio ?? bruto.input_tokens,
      texto: tokensDeAudio === undefined ? undefined : tokensDeTexto,
      saida: bruto.output_tokens,
    }
  }

  const custo = uso ? custoDaTranscricaoEmCentavos(MODELO_TRANSCRICAO, uso) : null

  const tokensEntrada =
    uso && (uso.audio !== undefined || uso.texto !== undefined)
      ? (uso.audio ?? 0) + (uso.texto ?? 0)
      : null

  return json(
    {
      texto,
      ia: {
        modelo: MODELO_TRANSCRICAO,
        custo,
        tokensEntrada,
        tokensSaida: uso?.saida ?? null,
      },
    },
    200,
  )
})

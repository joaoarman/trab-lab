// =============================================================================
// Edge Function `transcribe` — o áudio do usuário vira texto.
//
// ## Por que é uma função separada, e não um parâmetro da `chat`
//
// Dois motivos, e os dois vieram do produto:
//
//   • **CHAVE PRÓPRIA.** São duas credenciais diferentes da OpenAI, uma para
//     transcrever e outra para conversar, e cada função enxerga só a sua
//     (`OPENAI_API_KEY_TRANSCRIPTION` aqui, `OPENAI_API_KEY_CHAT` lá). Um
//     vazamento de uma não entrega a outra, e o custo de cada uma se lê separado
//     na fatura — o que importa num sistema cuja tela de Log existe justamente
//     para dizer quanto a IA custou;
//   • **A TELA PRECISA DOS DOIS MOMENTOS.** O usuário solta o botão do microfone e
//     vê a transcrição virar a bolha dele; só depois a IA começa a responder. Numa
//     função só, o app ficaria mudo do fim da gravação até a resposta inteira
//     ficar pronta — e o áudio é justamente o caminho de quem está no meio da rua,
//     com pressa.
//
// ## A função NÃO guarda o áudio
//
// Ela transcreve e devolve o texto. O que fica registrado é a frase, marcada como
// vinda do microfone (`ai_log.source = 'AUDIO'`). Guardar o arquivo custaria
// storage por mensagem e não responde nenhuma pergunta do produto — a conversa é
// o texto, e o log audita o que a IA fez com ele.
//
// ⚠️ **Esta função importa de `../chat/prompts.ts`** — o vocabulário do áudio e a
// tabela de preços. É a regra de um arquivo de prompt só no sistema, e o preço
// dela é esta dependência: renomear ou mover a pasta `chat/` quebra o deploy
// daqui. Em troca, não há cópia de tabela de preços para sincronizar.
//
// Deploy:  supabase functions deploy transcribe
// Segredo: supabase secrets set OPENAI_API_KEY_TRANSCRIPTION=sk-...
// =============================================================================
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

/**
 * Teto de 10 MB. A OpenAI aceita 25, mas isto aqui é recado de chat: com o Opus
 * do MediaRecorder, 10 MB são mais de uma hora de fala. O limite existe para um
 * envio errado (ou de má-fé) não virar uma chamada cara.
 */
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

  // O `verify_jwt` do Supabase já barrou quem não tem sessão; a checagem fica
  // porque esta função gasta dinheiro por chamada e não deve depender só de uma
  // configuração que alguém pode desligar sem perceber.
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
  // O nome do arquivo importa: a OpenAI escolhe o decodificador pela EXTENSÃO,
  // então um MP4 do Safari chamado `.webm` faz a transcrição falhar. Quem monta a
  // extensão certa é o front (ver `extensaoDe`, em src/pages/Chat/supabase.ts).
  envio.append('file', audio, audio.name || 'audio.webm')
  envio.append('model', MODELO_TRANSCRICAO)
  // O idioma é fixo em português porque é o padrão do produto e porque dizê-lo
  // evita o modelo "traduzir" um áudio com sotaque carregado para um idioma
  // parecido. Um sistema com usuários em inglês passaria isto como parâmetro.
  envio.append('language', 'pt')
  // O vocabulário financeiro — a diferença entre "mercado" e "marcado".
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

  // O custo volta junto com o texto porque é AQUI que ele se sabe — e a mensagem
  // que vai carregá-lo ainda não existe: ela só nasce quando a IA responder, na
  // outra função. Quem faz a ponte é a tela, que já está segurando a transcrição.
  //
  // Os modelos cobram de formas diferentes e a API responde conforme: os
  // `*-transcribe` devolvem tokens (separando áudio de texto na entrada), o
  // whisper-1 devolve a duração. Sem `usage` reconhecível, o custo fica null —
  // "não sei", que é diferente de "não custou".
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
      // Sem a quebra por tipo, a entrada inteira é tratada como ÁUDIO: é a maior
      // parte dela num recado falado, e errar para o lado mais caro é melhor do
      // que subdeclarar o gasto num sistema que existe para auditar gasto.
      audio: tokensDeAudio ?? bruto.input_tokens,
      texto: tokensDeAudio === undefined ? undefined : tokensDeTexto,
      saida: bruto.output_tokens,
    }
  }

  const custo = uso ? custoDaTranscricaoEmCentavos(MODELO_TRANSCRICAO, uso) : null

  // Os tokens vão junto do custo, e pelo mesmo motivo: é aqui que se sabem. Sem
  // eles, o custo gravado é um número sem prestação de contas — não dá para saber
  // se foram muitos tokens baratos ou poucos caros, nem o que mudou quando a conta
  // subir.
  //
  // A entrada vai SOMADA (áudio + texto): a quebra por tipo só serviria para
  // refazer o preço, e o preço já está calculado logo acima. Em whisper-1 não há
  // token nenhum a informar — ele cobra por minuto —, e aí os dois ficam null.
  const tokensEntrada =
    uso && (uso.audio !== undefined || uso.texto !== undefined)
      ? (uso.audio ?? 0) + (uso.texto ?? 0)
      : null

  // Áudio mudo (o usuário encostou no botão sem querer) devolve string vazia. É
  // caso legítimo, não erro: a tela descarta em silêncio em vez de mandar uma
  // mensagem em branco para a IA responder.
  return json(
    {
      texto,
      // Agrupado num objeto só porque a tela é apenas carregadora: ela leva isto
      // da transcrição até a função `chat`, que é quem grava a linha. Um objeto
      // atravessa a viagem inteiro; quatro campos soltos se perdem um a um.
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

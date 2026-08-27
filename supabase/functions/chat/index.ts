import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  AVISO_DE_CATEGORIA_NAO_CRIADA,
  AVISO_DE_ESCRITA_NAO_EFETIVADA,
  MAX_CARACTERES,
  MAX_CATEGORIAS_NO_PROMPT,
  MAX_MENSAGENS_DE_CONTEXTO,
  MAX_RODADAS_DE_FERRAMENTA,
  MAX_TOKENS_DE_RESPOSTA,
  MODELO_CHAT,
  MODELO_TRANSCRICAO,
  RESPOSTA_FORA_DO_ESCOPO,
  RESPOSTA_SEM_ESCRITA,
  TEMPERATURA,
  afirmaTerCriadoCategoria,
  afirmaTerGravado,
  ehTextoDeRecusa,
  custoDaConversaEmCentavos,
  idiomaDe,
  montarSystemPrompt,
} from './prompts.ts'
import type { CategoriaDoContexto, UsoDaConversa } from './prompts.ts'
import { FERRAMENTA_DE_RECUSA, FERRAMENTAS, SCHEMAS } from './ferramentas/index.ts'
import type { CategoriaConhecida, ContextoDaFerramenta, Recibo } from './ferramentas/index.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

interface MensagemDaOpenAI {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

interface FerramentaExecutada {
  nome: string
  argumentos: unknown
  ok: boolean
  erro?: string
}

const MAX_FERRAMENTAS_NO_LOG = 24

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'missing_token' }, 401)

  const chave = Deno.env.get('OPENAI_API_KEY_CHAT')
  if (!chave) return json({ error: 'ai_not_configured' }, 503)

  let corpo: {
    mensagem?: string
    origem?: string
    hoje?: string
    diaDaSemana?: string
    fusoEmMinutos?: unknown
    idioma?: unknown
    iaDaTranscricao?: { custo?: unknown; tokensEntrada?: unknown; tokensSaida?: unknown }
  }
  try {
    corpo = await request.json()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  const mensagem = (corpo.mensagem ?? '').trim()
  if (!mensagem) return json({ error: 'empty_message' }, 400)
  if (mensagem.length > MAX_CARACTERES) return json({ error: 'message_too_long' }, 400)

  const origem = corpo.origem === 'AUDIO' ? 'AUDIO' : 'TEXT'
  const idioma = idiomaDe(corpo.idioma)

  const numeroValido = (valor: unknown, teto: number): number | null => {
    const convertido = Number(valor)
    return Number.isFinite(convertido) && convertido >= 0 && convertido <= teto ? convertido : null
  }
  const inteiroValido = (valor: unknown, teto: number): number | null => {
    const convertido = numeroValido(valor, teto)
    return convertido === null ? null : Math.round(convertido)
  }

  const transcricao = origem === 'AUDIO' ? (corpo.iaDaTranscricao ?? {}) : {}
  const iaDaTranscricao = {
    custo: numeroValido(transcricao.custo, 100),
    modelo: origem === 'AUDIO' ? MODELO_TRANSCRICAO : null,
    tokensEntrada: inteiroValido(transcricao.tokensEntrada, 1_000_000),
    tokensSaida: inteiroValido(transcricao.tokensSaida, 1_000_000),
  }

  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(corpo.hoje ?? '')
    ? (corpo.hoje as string)
    : new Date().toISOString().slice(0, 10)
  const diaDaSemana = (corpo.diaDaSemana ?? '').slice(0, 40)
  const fusoBruto = Number(corpo.fusoEmMinutos)
  const fusoEmMinutos =
    Number.isFinite(fusoBruto) && Math.abs(fusoBruto) <= 840 ? Math.round(fusoBruto) : 0

  const cliente = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )

  const [perfil, categorias, historico] = await Promise.all([
    cliente.from('profile').select('full_name').maybeSingle(),
    cliente
      .from('category')
      .select('id, parent_id, name, color, is_active')
      .order('name', { ascending: true })
      .limit(MAX_CATEGORIAS_NO_PROMPT),
    cliente
      .from('ai_log')
      .select('role, content')
      .eq('is_active', true)
      .order('id', { ascending: false })
      .limit(MAX_MENSAGENS_DE_CONTEXTO),
  ])

  if (perfil.error || categorias.error || historico.error) {
    console.error('contexto', perfil.error ?? categorias.error ?? historico.error)
    return json({ error: 'context_failed' }, 500)
  }

  const arvore = montarArvore(
    (categorias.data ?? []) as {
      id: number
      parent_id: number | null
      name: string
      color: string
      is_active: boolean
    }[],
  )

  const systemPrompt = montarSystemPrompt({
    nome: (perfil.data?.full_name ?? '').split(' ')[0] ?? '',
    hoje,
    diaDaSemana,
    idioma,
    categorias: arvore.map(
      (categoria): CategoriaDoContexto => ({
        id: categoria.id,
        caminho: categoria.caminho,
        ativa: categoria.ativa,
      }),
    ),
  })

  // Vieram do mais novo para o mais velho; o modelo precisa da ordem da conversa.
  const anteriores = ((historico.data ?? []) as { role: string; content: string }[])
    .slice()
    .reverse()
    .map((linha) => ({
      role: linha.role === 'USER' ? ('user' as const) : ('assistant' as const),
      content: linha.content,
    }))

  const mensagens: MensagemDaOpenAI[] = [
    { role: 'system', content: systemPrompt },
    ...anteriores,
    { role: 'user', content: mensagem },
  ]

  const recibos: Recibo[] = []
  const ctx: ContextoDaFerramenta = {
    cliente,
    hoje,
    fusoEmMinutos,
    categorias: arvore,
    recibos,
    categoriasCriadas: [],
  }

  const executadas: FerramentaExecutada[] = []
  const uso: UsoDaConversa = { entrada: 0, entradaCacheada: 0, saida: 0 }

  let resposta = ''
  let escritasConfirmadas = 0
  let recusou = false
  let jaAvisado = false
  let jaAvisadoDaCategoria = false

  for (let rodada = 0; rodada < MAX_RODADAS_DE_FERRAMENTA; rodada++) {
    // Na última rodada as ferramentas saem, então o modelo tem de responder em texto.
    const ultimaRodada = rodada === MAX_RODADAS_DE_FERRAMENTA - 1

    const chamada = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_CHAT,
        temperature: TEMPERATURA,
        max_tokens: MAX_TOKENS_DE_RESPOSTA,
        messages: mensagens,
        ...(ultimaRodada ? {} : { tools: SCHEMAS, tool_choice: 'auto' }),
      }),
    })

    if (!chamada.ok) {
      console.error('openai', chamada.status, await chamada.text())
      return json({ error: chamada.status === 429 ? 'ai_rate_limited' : 'ai_failed' }, 502)
    }

    const dados = await chamada.json()

    const usoDaRodada = dados.usage as
      | {
          prompt_tokens?: number
          completion_tokens?: number
          prompt_tokens_details?: { cached_tokens?: number }
        }
      | undefined
    if (usoDaRodada) {
      uso.entrada += usoDaRodada.prompt_tokens ?? 0
      uso.saida += usoDaRodada.completion_tokens ?? 0
      uso.entradaCacheada += usoDaRodada.prompt_tokens_details?.cached_tokens ?? 0
    }

    const escolha = dados.choices?.[0]?.message as MensagemDaOpenAI | undefined
    if (!escolha) return json({ error: 'ai_failed' }, 502)

    const chamadas = escolha.tool_calls ?? []

    if (chamadas.length === 0) {
      const texto = (escolha.content ?? '').trim().slice(0, MAX_CARACTERES)

      // Disse que gravou, mas nenhuma ferramenta de escrita rodou.
      if (escritasConfirmadas === 0 && !recusou && afirmaTerGravado(texto)) {
        if (jaAvisado || ultimaRodada) {
          console.error('falso_sucesso', { avisado: jaAvisado, resposta: texto.slice(0, 200) })
          resposta = RESPOSTA_SEM_ESCRITA[idioma]
          break
        }

        jaAvisado = true
        mensagens.push({ role: 'assistant', content: texto })
        mensagens.push({ role: 'system', content: AVISO_DE_ESCRITA_NAO_EFETIVADA })
        continue
      }

      if (
        !recusou &&
        ctx.categoriasCriadas.length === 0 &&
        afirmaTerCriadoCategoria(texto) &&
        !jaAvisadoDaCategoria &&
        !ultimaRodada
      ) {
        jaAvisadoDaCategoria = true
        mensagens.push({ role: 'assistant', content: texto })
        mensagens.push({ role: 'system', content: AVISO_DE_CATEGORIA_NAO_CRIADA })
        continue
      }

      resposta = texto
      break
    }

    mensagens.push(escolha)

    for (const chamadaDeFerramenta of chamadas) {
      const nome = chamadaDeFerramenta.function.name
      const ferramenta = FERRAMENTAS[nome]

      let resultado: unknown
      let argumentos: unknown = null
      let ok = false

      if (!ferramenta) {
        resultado = { erro: `Ferramenta desconhecida: ${nome}` }
      } else {
        try {
          argumentos = JSON.parse(chamadaDeFerramenta.function.arguments || '{}')
          resultado = await ferramenta.executar(ctx, argumentos as Record<string, unknown>)
          ok = true

          if (ferramenta.escreve) escritasConfirmadas++
          if (nome === FERRAMENTA_DE_RECUSA) recusou = true
        } catch (erro) {
          const texto = erro instanceof Error ? erro.message : 'Falha ao executar a ferramenta.'
          resultado = { erro: texto }
        }
      }

      if (executadas.length < MAX_FERRAMENTAS_NO_LOG) {
        executadas.push({
          nome,
          argumentos,
          ok,
          ...(ok ? {} : { erro: (resultado as { erro?: string })?.erro }),
        })
      }

      mensagens.push({
        role: 'tool',
        tool_call_id: chamadaDeFerramenta.id,
        content: JSON.stringify(resultado),
      })
    }
  }

  if (!recusou && ehTextoDeRecusa(resposta)) recusou = true

  const tipoDaResposta = recusou ? 'REFUSAL' : 'MESSAGE'
  if (recusou) resposta = RESPOSTA_FORA_DO_ESCOPO[idioma]

  if (!resposta) return json({ error: 'ai_empty' }, 502)

  const { data: turno, error: erroAoGravar } = await cliente.rpc('ai_log_add_turn', {
    p_user_content: mensagem,
    p_assistant_content: resposta,
    p_user_source: origem,

    p_user_cost_usd_cents: iaDaTranscricao.custo,
    p_user_model: iaDaTranscricao.modelo,
    p_user_tokens_input: iaDaTranscricao.tokensEntrada,
    p_user_tokens_output: iaDaTranscricao.tokensSaida,

    p_assistant_kind: tipoDaResposta,
    p_assistant_receipts: recibos.length > 0 ? recibos : null,
    p_assistant_tool_calls: executadas.length > 0 ? executadas : null,
    p_assistant_cost_usd_cents: custoDaConversaEmCentavos(MODELO_CHAT, uso),
    p_assistant_model: MODELO_CHAT,
    p_assistant_tokens_input: uso.entrada,
    p_assistant_tokens_cached: uso.entradaCacheada,
    p_assistant_tokens_output: uso.saida,
  })

  if (erroAoGravar) {
    console.error('ai_log_add_turn', erroAoGravar.message)
    return json({ error: 'save_failed' }, 500)
  }

  return json({ mensagens: turno }, 200)
})

function montarArvore(
  linhas: { id: number; parent_id: number | null; name: string; color: string; is_active: boolean }[],
): CategoriaConhecida[] {
  const resolvidas = new Map<number, CategoriaConhecida>()
  let pendentes = linhas

  while (pendentes.length > 0) {
    const proximas: typeof pendentes = []

    for (const linha of pendentes) {
      const mae = linha.parent_id === null ? null : resolvidas.get(linha.parent_id)

      if (linha.parent_id !== null && !mae) {
        proximas.push(linha)
        continue
      }

      resolvidas.set(linha.id, {
        id: linha.id,
        paiId: linha.parent_id,
        nome: linha.name,
        cor: linha.color,
        ativa: linha.is_active,
        caminho: [...(mae?.caminho ?? []), linha.name],
      })
    }

    // Ninguém avançou: a mãe ficou fora do teto de categorias, e a filha vira raiz.
    if (proximas.length === pendentes.length) {
      for (const linha of proximas) {
        resolvidas.set(linha.id, {
          id: linha.id,
          paiId: linha.parent_id,
          nome: linha.name,
          cor: linha.color,
          ativa: linha.is_active,
          caminho: [linha.name],
        })
      }
      break
    }

    pendentes = proximas
  }

  return [...resolvidas.values()]
}

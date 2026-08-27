// =============================================================================
// Edge Function `chat` — o coração do Self OS.
//
// Uma mensagem entra, e daqui saem duas linhas gravadas em `public.ai_log` (a
// pergunta e a resposta) mais, quando houve registro, os cartões de confirmação
// que a bolha desenha.
//
// ## O caminho de uma mensagem
//
//   1. quem está falando (o JWT) e o que ele disse;
//   2. o CONTEXTO — nome, data de hoje dele, a árvore de categorias, as últimas
//      mensagens da conversa. Tudo em paralelo, porque nada depende do outro;
//   3. a CONVERSA COM O MODELO, em rodadas: ele pede ferramentas, elas rodam, o
//      resultado volta, ele pede mais ou fecha com texto;
//   4. as duas TRAVAS — a do falso sucesso (disse que gravou sem ter gravado) e a
//      do escopo (assunto que não é do sistema);
//   5. o TURNO GRAVADO, numa transação só, com custo, tokens e auditoria.
//
// ## Segurança: o JWT do usuário, nunca service_role
//
// O cliente Supabase daqui é montado com a chave ANÔNIMA mais o token de quem
// mandou a mensagem. Toda leitura e toda escrita que a IA faz passam pela MESMA
// RLS que a tela usa — se um prompt pedisse o gasto de outra pessoa, o banco
// devolveria os do dono do token e nada mais. A regra vale igual
// para a IA e para o formulário, e isso não é uma escolha de implementação: é o
// que impede um prompt de virar um vazamento.
//
// Deploy:  supabase functions deploy chat
// Segredo: supabase secrets set OPENAI_API_KEY_CHAT=sk-...
// O passo a passo completo está documentado à parte.
// =============================================================================
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

/** Uma mensagem no formato da API da OpenAI. */
interface MensagemDaOpenAI {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

/** Uma linha do que a IA fez, para `ai_log.tool_calls`. */
interface FerramentaExecutada {
  nome: string
  argumentos: unknown
  ok: boolean
  erro?: string
}

/**
 * Quantas ferramentas cabem no log de um turno.
 *
 * Um turno normal tem uma ou duas. O teto existe para o turno patológico (o
 * modelo em laço de erro-e-correção), em que a coluna jsonb cresceria sem limite
 * numa tabela que ninguém apaga.
 */
const MAX_FERRAMENTAS_NO_LOG = 24

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'missing_token' }, 401)

  const chave = Deno.env.get('OPENAI_API_KEY_CHAT')
  if (!chave) return json({ error: 'ai_not_configured' }, 503)

  // ---------------------------------------------------------------------------
  // 1. Quem está falando, e o quê
  // ---------------------------------------------------------------------------

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

  // O extrato da transcrição vem de fora (a função `transcribe` fez a chamada, e a
  // linha que vai carregá-lo só nasce aqui). Ele é do CLIENTE, então tudo passa
  // por faixa: um custo negativo ou absurdo entraria direto no relatório do log.
  const transcricao = origem === 'AUDIO' ? (corpo.iaDaTranscricao ?? {}) : {}
  const iaDaTranscricao = {
    custo: numeroValido(transcricao.custo, 100),
    modelo: origem === 'AUDIO' ? MODELO_TRANSCRICAO : null,
    tokensEntrada: inteiroValido(transcricao.tokensEntrada, 1_000_000),
    tokensSaida: inteiroValido(transcricao.tokensSaida, 1_000_000),
  }

  // QUEM SABE QUE DIA É HOJE É O CLIENTE. O servidor roda em UTC e viraria o dia
  // às 21h de Brasília, jogando o gasto da noite para amanhã — e fazendo o "quanto
  // gastei hoje" das 21h30 responder zero. Por isso a data e o fuso vêm da tela.
  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(corpo.hoje ?? '')
    ? (corpo.hoje as string)
    : new Date().toISOString().slice(0, 10)
  const diaDaSemana = (corpo.diaDaSemana ?? '').slice(0, 40)
  // A convenção é a do `getTimezoneOffset()`: minutos a SOMAR à hora local para
  // chegar em UTC. A faixa cobre de UTC−14 a UTC+14, os extremos reais do planeta.
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

  // ---------------------------------------------------------------------------
  // 2. O contexto — tudo em paralelo, nada depende do outro
  // ---------------------------------------------------------------------------

  const [perfil, categorias, historico] = await Promise.all([
    cliente.from('profile').select('full_name').maybeSingle(),
    // As DESATIVADAS vêm junto: sem elas a IA criaria uma "Gasolina" nova ao lado
    // da que está no submenu "Desativadas", e o índice único recusaria — um erro
    // que o usuário não teria como entender.
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

  // ---------------------------------------------------------------------------
  // 3. A conversa com o modelo, com as ferramentas no meio
  // ---------------------------------------------------------------------------

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
    // Na última rodada as ferramentas saem da mesa: sem elas o modelo é OBRIGADO a
    // fechar com texto, em vez de pedir mais uma chamada para sempre.
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

      // --- A TRAVA DO FALSO SUCESSO ---
      //
      // O texto afirma ter gravado, mas nenhuma ferramenta de escrita rodou. É o
      // pior defeito possível aqui: o usuário sai da conversa achando que
      // registrou, não confere de novo, e semanas depois o mês não fecha sem
      // nenhuma pista de onde o buraco começou.
      //
      // A resposta ainda não chegou à tela, então dá para consertar: o modelo
      // recebe um aviso de sistema e uma segunda chance. Se insistir, o usuário lê
      // a verdade — "não salvei nada" — em vez de uma confirmação mentirosa.
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

      // --- A TRAVA DA CATEGORIA ANUNCIADA E NÃO CRIADA ---
      //
      // A trava de cima pergunta "rodou alguma escrita?", e por isso não pega este
      // caso: o gasto FOI registrado (escrita rodou) numa categoria antiga, e o
      // texto anuncia uma categoria nova que nunca nasceu. Aconteceu de verdade —
      // o modelo mandou `categoria_id` junto do caminho, o gasto caiu na gaveta
      // velha, e a resposta disse "criei Casa › Mercado".
      //
      // Aqui a correção é barata e vale a rodada extra: o modelo remaneja o
      // lançamento com `editar_gasto`, agora mandando só o caminho. Se ele
      // insistir, a resposta segue como está — não há frase honesta pronta para
      // este caso, e o cartão já mostra a categoria REAL do lançamento, então o
      // usuário tem como ver a divergência.
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

    // A mensagem do assistente com os `tool_calls` precisa entrar no histórico
    // ANTES dos resultados: a API recusa um `tool` que não responda a nada.
    mensagens.push(escolha)

    // SEQUENCIAL, e não em paralelo, de propósito. Duas chamadas de
    // `registrar_gasto` na mesma mensagem ("gastei 20 no posto e 40 no mercado")
    // podem resolver o MESMO caminho de categoria; em paralelo, as duas achariam
    // "não existe" e as duas tentariam criar — e o índice único derrubaria a
    // segunda. Em série, a primeira cria e a segunda encontra. O custo é
    // milissegundos; o benefício é a árvore não quebrar na frase mais comum do
    // sistema.
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
          // O erro volta PARA O MODELO, não para a tela: é assim que ele corrige a
          // chamada em vez de a conversa morrer num "algo deu errado". As frases
          // são escritas para serem acionáveis (ver `traduzirErroDoBanco`).
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

  // ---------------------------------------------------------------------------
  // 4. A trava do escopo
  // ---------------------------------------------------------------------------
  //
  // A recusa é ESCRITA AQUI, e o texto do modelo é descartado. Se ele a redigisse,
  // sairia diferente toda vez — às vezes explicando as regras do sistema, às vezes
  // pedindo desculpas, às vezes comentando justamente o assunto que deveria ter
  // ignorado. Uma frase fixa é a única que não vaza nada e não abre conversa.
  //
  // Os CARTÕES continuam indo junto quando houve registro. É o caso da mensagem
  // meio dentro e meio fora ("lança meu almoço de 32 e escreve um e-mail pro
  // chefe"): a bolha vermelha diz que a segunda parte não é daqui, e o cartão
  // embaixo prova que a primeira foi feita.
  // A REDE EMBAIXO DA FERRAMENTA DE RECUSA.
  //
  // O modelo às vezes escreve a frase padrão de recusa como texto normal, sem
  // chamar `assunto_fora_do_sistema` — e ele faz isso justamente depois de já ter
  // recusado uma ou duas vezes, porque a frase está no histórico como mensagem
  // dele e imitar a anterior é o que um modelo faz de melhor. O resultado é uma
  // bolha BRANCA dizendo exatamente o que a bolha vermelha logo acima diz.
  //
  // A ferramenta continua sendo o caminho, e o texto continua não sendo prova de
  // nada — exceto neste caso, em que o texto é uma constante DESTE sistema. Se a
  // resposta é a frase que nós escrevemos, ela é uma recusa, tenha a ferramenta
  // rodado ou não.
  if (!recusou && ehTextoDeRecusa(resposta)) recusou = true

  const tipoDaResposta = recusou ? 'REFUSAL' : 'MESSAGE'
  if (recusou) resposta = RESPOSTA_FORA_DO_ESCOPO[idioma]

  if (!resposta) return json({ error: 'ai_empty' }, 502)

  // ---------------------------------------------------------------------------
  // 5. Gravar o turno — pergunta e resposta, ou nada
  // ---------------------------------------------------------------------------

  const { data: turno, error: erroAoGravar } = await cliente.rpc('ai_log_add_turn', {
    p_user_content: mensagem,
    p_assistant_content: resposta,
    p_user_source: origem,

    p_user_cost_usd_cents: iaDaTranscricao.custo,
    p_user_model: iaDaTranscricao.modelo,
    p_user_tokens_input: iaDaTranscricao.tokensEntrada,
    p_user_tokens_output: iaDaTranscricao.tokensSaida,

    p_assistant_kind: tipoDaResposta,
    // `null` e não `[]` quando não houve nada: null é "não se aplica", e um array
    // vazio na coluna faria a tela ter de distinguir dois jeitos de dizer o mesmo.
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

// -----------------------------------------------------------------------------
// A árvore de categorias, na memória
// -----------------------------------------------------------------------------

/**
 * A lista plana do banco → cada categoria com o CAMINHO inteiro até ela.
 *
 * O caminho é o que o prompt mostra à IA e o que o cartão de confirmação exibe.
 * Sem ele, "Gasolina" sozinha não deixaria o usuário conferir se a IA acertou a
 * gaveta — e não deixaria a IA distinguir a `Casa › Mercado` da `Trabalho ›
 * Mercado`.
 *
 * A montagem é iterativa e por níveis, não recursiva: uma linha só entra depois
 * que a mãe dela já tem caminho. Com no máximo tantas passadas quantas forem as
 * categorias, um ciclo (que o banco não deveria permitir) termina o laço em vez de
 * travar a função.
 */
function montarArvore(
  linhas: { id: number; parent_id: number | null; name: string; color: string; is_active: boolean }[],
): CategoriaConhecida[] {
  const resolvidas = new Map<number, CategoriaConhecida>()
  let pendentes = linhas

  while (pendentes.length > 0) {
    const proximas: typeof pendentes = []

    for (const linha of pendentes) {
      const mae = linha.parent_id === null ? null : resolvidas.get(linha.parent_id)

      // Mãe ainda não resolvida: fica para a próxima passada. Uma mãe que não está
      // na lista (cortada pelo teto do prompt) nunca resolveria — daí a checagem
      // de progresso lá embaixo.
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

    // Nenhum progresso na passada: o que sobrou é órfão (mãe fora da lista) ou está
    // num ciclo. Entra com o caminho que dá para saber — o nome — em vez de sumir
    // do prompt, o que faria a IA criar uma categoria duplicada.
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

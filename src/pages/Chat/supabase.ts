// =============================================================================
// Camada de dados do módulo Chat.
//
// TODAS as chamadas ao banco deste módulo moram aqui — as telas importam estas
// funções e nunca chamam o Supabase direto. As funções RETORNAM tipos de domínio
// de `src/shared/data/model.ts` (camelCase), traduzindo a linha do banco
// (snake_case) aqui dentro.
//
// ## ESTE MÓDULO É DIFERENTE DOS OUTROS
//
// Mandar mensagem **não é uma escrita daqui**. É chamar a Edge Function `chat`,
// que roda no servidor porque é lá que a chave da OpenAI pode existir — no bundle
// do front ela seria pública, e qualquer pessoa a leria no "ver código-fonte".
// É a função que conversa com o modelo, executa o que ele pedir e grava o turno.
//
// Consequência: não há `insert` nem `update` em `ai_log` neste arquivo, e não é
// esquecimento — **não existe grant** de escrita nessa tabela. Sem esse recorte,
// um cliente poderia forjar uma resposta da IA, inclusive um cartão de "gasto
// salvo" que nunca aconteceu.
//
// ## Segurança
//
// A Edge Function usa o **JWT do próprio usuário**, nunca service_role. Toda
// leitura e toda escrita que a IA faz passam pela mesma RLS que a tela usa: se um
// prompt pedisse o gasto de outra pessoa, o banco devolveria os do dono do token
// e nada mais.
//
// O schema deste módulo vive em supabase/migrations/ e supabase/schema/.
// =============================================================================
import { supabase } from '@/shared/lib/supabaseClient'
import type { MensagemDaIA, OrigemDaMensagem } from '@/shared/data/model'
import { COLUNAS_DA_MENSAGEM, paraMensagem, type LinhaDeAiLog } from '@/shared/data/aiLog'

// -----------------------------------------------------------------------------
// Erros
// -----------------------------------------------------------------------------

/**
 * Os erros deste módulo em códigos estáveis — a tela mapeia para
 * `chat.errors.<codigo>` e nunca mostra texto cru do Supabase nem da OpenAI.
 *
 * Eles são poucos e escolhidos pelo que MUDAM para quem está com o celular na
 * mão: "falta configurar a chave" é problema do dono do sistema, "muitas chamadas"
 * é questão de esperar meio minuto, e "não salvou" pede tentar de novo. Um erro
 * genérico para os três faria a pessoa insistir num caso em que insistir não
 * resolve.
 */
export type CodigoDeErroDoChat =
  /** Falta a chave da OpenAI no ambiente da Edge Function. */
  | 'ai_not_configured'
  /** O provedor recusou por excesso de chamadas — é questão de esperar. */
  | 'ai_rate_limited'
  /** A IA falhou ou devolveu vazio. */
  | 'ai_failed'
  /** O áudio não foi transcrito. */
  | 'transcription_failed'
  /** O áudio passou do limite de tamanho. */
  | 'audio_too_large'
  /** A IA respondeu, mas o turno não foi gravado. */
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

/**
 * O erro da Edge Function chega embrulhado.
 *
 * O supabase-js embrulha uma resposta de erro num `FunctionsHttpError` cujo
 * `context` é a `Response` crua — e o motivo real está no CORPO dela. Ler o corpo
 * é a única forma de distinguir "falta configurar a chave" de "a OpenAI está fora
 * do ar", e são mensagens muito diferentes para quem está tentando registrar um
 * gasto no meio da rua.
 */
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

    // `ai_empty` é a IA responder em branco. Para quem lê a tela, é a IA falhando
    // — não um estado próprio que valha uma mensagem diferente.
    if (corpo.error === 'ai_empty') return 'ai_failed'
  } catch {
    // Corpo que não é JSON: cai no genérico.
  }

  return 'unknown'
}

// -----------------------------------------------------------------------------
// Leitura
// -----------------------------------------------------------------------------

/** Quantas mensagens vêm por vez — enche a tela e sobra para rolar. */
export const TAMANHO_DA_PAGINA = 40

/**
 * As mensagens da conversa: as mais NOVAS primeiro no banco, já invertidas aqui
 * para a tela desenhar de cima para baixo, como qualquer conversa.
 *
 * `antesDe` é o id a partir do qual buscar para trás — é o que o "carregar
 * anteriores" usa ao chegar no topo da rolagem.
 *
 * Paginar por **id**, e não por data, porque a pergunta e a resposta de um turno
 * nascem no mesmo `now()`: uma paginação por `created_at` poderia repetir ou pular
 * uma das duas justamente na virada da página.
 *
 * `is_active` é o filtro que separa este módulo do Log da IA — o que o usuário
 * limpou saiu da conversa, mas continua no banco e continua auditável lá.
 */
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

// -----------------------------------------------------------------------------
// Escrita — pela Edge Function
// -----------------------------------------------------------------------------

/**
 * O extrato de uma chamada de IA: quanto custou e quantos tokens levou.
 *
 * Ele nasce na Edge Function que fez a chamada (`transcribe`) e é gravado por
 * OUTRA (`chat`), junto da linha da mensagem — porque quando a transcrição
 * acontece a mensagem ainda não existe. A tela é só **carregadora**, e por isso os
 * campos andam juntos num objeto: um objeto atravessa a viagem inteiro, três
 * campos soltos se perdem um a um.
 *
 * Não há o nome do modelo aqui, de propósito: quem grava a linha é a função
 * `chat`, e ela lê o modelo da própria constante em `prompts.ts`. Um dado que o
 * servidor sabe sozinho não deve fazer a viagem pelo cliente — custo e tokens
 * fazem porque dependem do áudio, que só a função `transcribe` viu.
 *
 * Todo campo é anulável, e null nunca é zero: é "não houve chamada" ou "a API não
 * informou".
 */
export interface ExtratoDeIA {
  /** Em CENTAVOS de dólar. Null = modelo sem preço na tabela, ou sem `usage`. */
  custoEmCentavos: number | null
  tokensEntrada: number | null
  tokensSaida: number | null
}

/**
 * Manda a mensagem para a IA e devolve o turno inteiro (a do usuário e a
 * resposta), já com os ids que o banco gerou.
 *
 * ## Por que a data e o fuso vão junto
 *
 * **Quem sabe que dia é hoje é o cliente.** O servidor roda em UTC e viraria o dia
 * às 21h de Brasília — o gasto da noite cairia em amanhã, e o "quanto gastei hoje"
 * das 21h30 responderia zero. `hoje` resolve "ontem" e "sexta passada" no prompt;
 * `fusoEmMinutos` (o `getTimezoneOffset()` do navegador) converte uma data dita
 * pela IA em instante UTC na hora de gravar.
 *
 * Nada é gravado se a IA falhar: o turno é atômico, então a mensagem não vira
 * bolha órfã esperando uma resposta que não vem.
 */
export async function enviarMensagem(entrada: {
  texto: string
  origem: OrigemDaMensagem
  /** A data de hoje do usuário, YYYY-MM-DD. */
  hoje: string
  /** O nome do dia por extenso, no idioma ativo. */
  diaDaSemana: string
  /** `Date.prototype.getTimezoneOffset()`: minutos a somar ao local para virar UTC. */
  fusoEmMinutos: number
  /** O idioma ativo do app — decide o idioma da resposta e o da recusa padrão. */
  idioma: string
  /** O extrato da transcrição, quando a mensagem veio de áudio. */
  transcricao?: ExtratoDeIA | null
}): Promise<MensagemDaIA[]> {
  const { data, error } = await supabase.functions.invoke('chat', {
    method: 'POST',
    body: {
      // Os nomes viram português na fronteira: quem lê do outro lado é a Edge
      // Function, e lá o vocabulário é o do prompt.
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

/**
 * A extensão do arquivo, a partir do formato que o navegador gravou.
 *
 * Importa mais do que parece: a OpenAI escolhe o decodificador pela **extensão**
 * do nome, então mandar um MP4 chamado `.webm` faz a transcrição falhar. E o
 * formato varia por navegador — Chrome e Firefox gravam WebM/Opus, o Safari grava
 * MP4 —, o que atingiria justamente o iPhone, onde o áudio é o caminho mais usado.
 */
function extensaoDe(mimeType: string): string {
  // O tipo vem como "audio/webm;codecs=opus": só a parte antes do ponto e vírgula,
  // e só o que vem depois da barra.
  const formato = mimeType.split(';')[0].split('/')[1] ?? ''
  const conhecidos = ['webm', 'mp4', 'mpeg', 'mp3', 'ogg', 'wav', 'm4a']
  return conhecidos.includes(formato) ? formato : 'webm'
}

/** O que a transcrição devolve: o texto e o extrato da chamada. */
export interface Transcricao {
  /** Vazio quando o áudio saiu mudo — caso legítimo, não erro. */
  texto: string
  ia: ExtratoDeIA
}

/**
 * Transcreve o áudio gravado e devolve o texto — vazio quando o áudio saiu mudo
 * (o usuário encostou no botão sem querer), o que é caso legítimo e não erro: a
 * tela descarta em silêncio.
 *
 * A transcrição é uma Edge Function separada da conversa por duas razões: são
 * duas chaves diferentes da OpenAI, e a tela precisa dos **dois momentos** — a
 * fala vira bolha assim que é transcrita, e só então a IA começa a responder. Numa
 * função só, o app ficaria mudo do fim da gravação até a resposta inteira ficar
 * pronta.
 *
 * O **extrato volta junto** porque é aqui que ele se sabe, e a mensagem que vai
 * carregá-lo ainda não existe — ela nasce quando a IA responder. Quem faz a ponte
 * é a tela, repassando o objeto a `enviarMensagem`.
 */
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
        // `modelo` também vem, e é ignorado: o servidor o resolve sozinho.
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

/**
 * Limpa a conversa: as mensagens somem da tela e do contexto da IA, **mas não do
 * banco**.
 *
 * É `is_active = false`, nunca `delete`, e a diferença importa em duas frentes. O
 * **histórico** sobrevive a um toque acidental no botão, e o **custo** de cada
 * mensagem continua contabilizado — a tela do Log da IA continua mostrando tudo.
 * Se as linhas fossem apagadas, a única prestação de contas de quanto a IA custou
 * iria junto.
 *
 * Não há caminho de `delete` nesta tabela: nem grant, nem policy. E limpar a
 * conversa **não desfaz registro nenhum** — `ai_log` e as tabelas de gasto,
 * receita e categoria não se referenciam. A modal de confirmação diz isso antes
 * de perguntar.
 */
export async function limparConversa(): Promise<void> {
  const { error } = await supabase.rpc('chat_clear')
  if (error) throw new ErroDoChat('unknown')
}

// =============================================================================
// O vocabulário comum das ferramentas do Chat.
//
// Aqui moram as três coisas que TODA ferramenta precisa e nenhuma deveria
// reimplementar:
//
//   • o CONTRATO (`Ferramenta`, `ContextoDaFerramenta`) — o que uma ferramenta é
//     e o que ela recebe para trabalhar;
//   • as CONTAS DE DATA no fuso do usuário — o servidor roda em UTC, e "hoje"
//     dito às 22h de Brasília é amanhã para ele;
//   • a leitura dos ARGUMENTOS que vêm do modelo — que são texto gerado, não
//     entrada de formulário, e portanto se validam antes de virar consulta.
//
// ## O que NÃO mora aqui: a segurança
//
// Nenhuma ferramenta escreve filtro por dono. O cliente Supabase que elas
// recebem é montado com o **JWT do próprio usuário**, nunca com service_role, e
// quem limita o que se enxerga é a RLS — a mesma que limita a tela. Se um prompt
// pedisse o gasto de outra pessoa, o banco devolveria os do dono do token e nada
// mais. A regra vale igual para a IA e para o formulário.
// =============================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// -----------------------------------------------------------------------------
// O contrato
// -----------------------------------------------------------------------------

export interface SchemaDeFerramenta {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** A moeda de um lançamento — o espelho do enum `public.currency`. */
export type Moeda = 'BRL' | 'USD'

/**
 * O CARTÃO DE CONFIRMAÇÃO de um registro — o retrato dele no instante em que foi
 * salvo, gravado em `ai_log.receipts` e desenhado pela bolha.
 *
 * É um **recibo**, e é por isso que ele carrega os valores em vez de um id: a
 * bolha de três semanas atrás tem de continuar mostrando o que foi salvo naquele
 * dia, mesmo que o gasto tenha sido editado (ou excluído) depois. Um cartão que
 * muda sozinho não serve para conferir nada, e conferir é a única razão de ele
 * existir.
 *
 * Os campos anuláveis não são preenchidos com zero quando faltam: um gasto em
 * reais tem `cotacao` nula porque não houve conversão, e a tela lê essa ausência
 * para não desenhar a linha de câmbio.
 */
export interface Recibo {
  acao: 'criado' | 'editado' | 'excluido' | 'desativado'
  tipo: 'gasto' | 'receita' | 'categoria'
  id: number
  /** O nome do gasto/receita, ou o nome da categoria. */
  nome: string
  /** Em reais ou na unidade de `moeda`. Ausente na categoria. */
  valor?: number
  moeda?: Moeda
  /** Quantos reais valia 1 unidade de `moeda` no momento. Null em BRL. */
  cotacao?: number | null
  /** O mesmo valor em reais — é o que todo total do sistema soma. */
  valorEmBrl?: number
  /** A hierarquia INTEIRA da categoria: `['Carro', 'Gasolina']`. */
  categoria?: string[] | null
  /** A cor da categoria (hex), quando o cartão é de categoria. */
  cor?: string
  /**
   * True = a categoria deste lançamento **nasceu neste turno**.
   *
   * É o antídoto para o defeito que mais dói aqui: a IA escrever "criei a
   * categoria X" sem ter criado nada. O texto da bolha é o que o modelo diz; este
   * campo é o que o banco fez. A tela desenha a marca a partir DELE, então a
   * afirmação de que a árvore mudou passa a ser verificável de relance, sem abrir
   * a tela de Categorias.
   */
  categoriaCriada?: boolean
  /** Quando o lançamento ACONTECEU (occurred_at / received_at), em ISO. */
  aconteceuEm?: string
  /** Quando a linha entrou no banco, em ISO. Sempre presente. */
  criadoEm: string
}

/** Uma categoria do usuário, já com o caminho montado. */
export interface CategoriaConhecida {
  id: number
  paiId: number | null
  nome: string
  cor: string
  ativa: boolean
  /** Do topo até ela: `['Carro', 'Gasolina']`. */
  caminho: string[]
}

/** Tudo o que uma ferramenta recebe para trabalhar. */
export interface ContextoDaFerramenta {
  /** Montado com o JWT do usuário. A RLS faz o resto. */
  cliente: SupabaseClient
  /** A data de hoje do USUÁRIO (YYYY-MM-DD). */
  hoje: string
  /**
   * O `getTimezoneOffset()` do navegador dele: quantos minutos somar a uma hora
   * local para chegar em UTC (Brasília manda 180). Ver `paraIso`.
   */
  fusoEmMinutos: number
  /** A árvore dele, do jeito que o prompt a viu. */
  categorias: CategoriaConhecida[]
  /** Onde as ferramentas de escrita depositam o cartão de confirmação. */
  recibos: Recibo[]
  /**
   * Os ids das categorias que NASCERAM neste turno.
   *
   * Existe para o laço da conversa poder conferir a frase do modelo contra o fato
   * — "criei a categoria Mercado" só é verdade se algo entrou aqui. Sem esta
   * lista, a única prova de criação seria o texto do próprio modelo, que é
   * exatamente o que não se pode acreditar.
   */
  categoriasCriadas: number[]
}

export interface Ferramenta {
  schema: SchemaDeFerramenta
  /**
   * True = a ferramenta ESCREVE no banco.
   *
   * Não é documentação: é o fato que a trava do falso sucesso confere contra o
   * texto da IA (ver `afirmaTerGravado`, em prompts.ts). Marcar de escrita uma
   * ferramenta que só lê desarmaria a trava em silêncio.
   */
  escreve?: boolean
  executar: (ctx: ContextoDaFerramenta, args: Record<string, unknown>) => Promise<unknown>
}

// -----------------------------------------------------------------------------
// Erros — que voltam PARA O MODELO, não para a tela
// -----------------------------------------------------------------------------

/**
 * O erro do Postgres → uma frase que o modelo entende e consegue corrigir.
 *
 * A tradução acontece aqui porque o destinatário é o modelo: ele recebe o texto
 * como resultado da ferramenta e tenta de novo com o argumento certo. Devolver
 * `duplicate key value violates unique constraint "category_sibling_name_uk"` o
 * faria desistir; devolver "já existe uma categoria com esse nome nesse lugar" o
 * faz usar a que existe.
 *
 * O usuário nunca lê estas frases — ele lê o que a IA escreveu depois de ler
 * uma delas.
 */
const ERROS_COMUNS: Record<string, string> = {
  profile_not_found: 'Não foi possível identificar o usuário.',
  expense_rate_required: 'Gasto em moeda estrangeira exige a cotação.',
  income_rate_required: 'Receita em moeda estrangeira exige a cotação.',
  expense_amount_out_of_range:
    'O valor convertido para reais não cabe no limite do sistema (máximo R$ 9.999.999,99).',
  income_amount_out_of_range:
    'O valor convertido para reais não cabe no limite do sistema (máximo R$ 9.999.999,99).',
  expense_category_not_found: 'Essa categoria não existe (ou foi excluída).',
  expense_not_found: 'Não existe gasto com esse id.',
  income_not_found: 'Não existe receita com esse id.',
  category_not_found: 'Não existe categoria com esse id.',
  category_parent_deleted: 'A categoria mãe foi excluída.',
  category_cycle: 'Uma categoria não pode ser descendente de si mesma.',
  category_path_empty: 'O caminho da categoria veio vazio.',
  category_path_too_deep: 'Caminho de categoria fundo demais — use no máximo 3 degraus.',
  category_name_invalid: 'Nome de categoria inválido (1 a 60 caracteres).',
}

export function traduzirErroDoBanco(erro: { message?: string; code?: string } | null): never {
  const mensagem = (erro?.message ?? '').toLowerCase()

  for (const [chave, texto] of Object.entries(ERROS_COMUNS)) {
    if (mensagem.includes(chave)) throw new Error(texto)
  }

  // 23505 = unique_violation. Nesta base só existe um índice único que o cliente
  // alcança: o de duas irmãs com o mesmo nome.
  if (erro?.code === '23505') {
    throw new Error('Já existe uma categoria com esse nome nesse mesmo lugar da árvore.')
  }
  // 23514 = check_violation. Na prática é sempre a faixa do valor.
  if (erro?.code === '23514') {
    throw new Error('Valor fora da faixa aceita (de R$ 0,01 a R$ 9.999.999,99).')
  }

  throw new Error('Não foi possível concluir a operação no banco.')
}

// -----------------------------------------------------------------------------
// Datas — TUDO no fuso do usuário
// -----------------------------------------------------------------------------
//
// A Edge Function roda em UTC. Se ela resolvesse "hoje" sozinha, quem está em
// Brasília veria o gasto das 22h cair no dia seguinte — e o "quanto gastei hoje"
// das 22h30 responderia zero. Por isso a tela manda DUAS coisas junto de cada
// mensagem: a data de hoje dela (`hoje`) e o deslocamento do fuso
// (`fusoEmMinutos`, o `getTimezoneOffset()` do navegador).
//
// A convenção do offset é a do JavaScript, e ela é invertida em relação à
// intuição: `getTimezoneOffset()` devolve **quantos minutos somar à hora local
// para chegar em UTC**. Brasília (UTC−3) manda +180.

/**
 * Uma hora de parede local → o instante em ISO/UTC.
 *
 * Aceita 'YYYY-MM-DD' (que vira meia-noite local) e 'YYYY-MM-DDTHH:mm[:ss]'.
 * Devolve null quando o texto não é nenhum dos dois — o que acontece: quem
 * preenche este campo é um modelo de linguagem.
 */
export function paraIso(local: string, fusoEmMinutos: number): string | null {
  const casado = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(local.trim())
  if (!casado) return null

  const [, ano, mes, dia, hora = '00', minuto = '00', segundo = '00'] = casado

  // `Date.UTC` monta o instante como se a hora dita fosse UTC; somar o offset em
  // seguida a desloca para o fuso de verdade. É a conta que `new Date(...)` faria
  // sozinha no navegador — e que aqui, num servidor em UTC, precisa ser explícita.
  const comoSeFosseUtc = Date.UTC(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    Number(hora),
    Number(minuto),
    Number(segundo),
  )
  if (Number.isNaN(comoSeFosseUtc)) return null

  return new Date(comoSeFosseUtc + fusoEmMinutos * 60_000).toISOString()
}

/**
 * As duas pontas de um período, prontas para a consulta.
 *
 * O recorte é **fechado no início e ABERTO no fim**: o `ate` vira o começo do dia
 * seguinte. Comparar `<= '2026-08-31'` deixaria de fora tudo o que aconteceu
 * depois da meia-noite daquele dia — o último dia do recorte inteiro, em
 * silêncio. É a mesma convenção de `src/shared/utils/datas.ts` e das RPCs de
 * agregação.
 */
/**
 * O recorte quando o modelo NÃO mandou período — "o último gasto que registrei".
 *
 * Os dois nulos significam "sem limite deste lado", e é a resposta honesta: não
 * havia recorte na pergunta. A alternativa seria a Edge Function inventar um
 * ("desde 1970"), e aí o Log da IA mostraria uma decisão que a IA nunca tomou.
 */
export const SEM_PERIODO = { de: null, ate: null } as const

/**
 * O período pedido, ou `SEM_PERIODO` quando nenhuma data veio — e `null` (erro)
 * só quando veio data e ela não presta.
 *
 * A distinção entre "não mandou" e "mandou torto" é o ponto: a primeira é uma
 * pergunta legítima ("qual foi o último?"), a segunda é um argumento inválido que
 * tem de voltar ao modelo para ele corrigir. Tratar as duas como erro tirava do ar
 * a pergunta mais natural que se faz a um assistente de gastos.
 */
export function periodoOpcional(
  de: unknown,
  ate: unknown,
  fusoEmMinutos: number,
): { de: string | null; ate: string | null } | null {
  const inicio = texto(de, 10)
  const fim = texto(ate, 10)

  if (!inicio && !fim) return SEM_PERIODO

  // Uma ponta só é recorte legítimo ("de março para cá"): a que falta vira nulo,
  // que o banco lê como "sem limite deste lado".
  const limites = limitesDoPeriodo(inicio ?? '1970-01-01', fim ?? '2999-12-31', fusoEmMinutos)
  if (!limites) return null

  return { de: inicio ? limites.de : null, ate: fim ? limites.ate : null }
}

export function limitesDoPeriodo(
  de: string,
  ate: string,
  fusoEmMinutos: number,
): { de: string; ate: string } | null {
  const inicio = paraIso(`${de.slice(0, 10)}T00:00`, fusoEmMinutos)
  if (!inicio) return null

  const casado = /^(\d{4})-(\d{2})-(\d{2})/.exec(ate.trim())
  if (!casado) return null

  // `Date.UTC(ano, mes, dia + 1)` com o dia 31 vira o dia 1 do mês seguinte
  // sozinho: o construtor normaliza o estouro, então não é preciso saber quantos
  // dias tem cada mês nem se o ano é bissexto.
  const [, ano, mes, dia] = casado
  const fimLocal = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia) + 1))
  const fim = new Date(fimLocal.getTime() + fusoEmMinutos * 60_000).toISOString()

  return { de: inicio, ate: fim }
}

// -----------------------------------------------------------------------------
// Leitura dos argumentos do modelo
// -----------------------------------------------------------------------------
//
// Os argumentos de uma ferramenta chegam como JSON produzido por um modelo de
// linguagem. O schema da função ajuda, mas não garante: o modelo manda string
// onde pediu número, manda o campo errado, ou simplesmente inventa. Nada disso
// pode virar consulta sem passar por aqui.

export function texto(valor: unknown, maximo: number): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' || limpo.length > maximo ? null : limpo
}

export function numero(valor: unknown): number | null {
  const convertido = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(convertido) ? convertido : null
}

export function inteiro(valor: unknown): number | null {
  const convertido = numero(valor)
  return convertido === null ? null : Math.trunc(convertido)
}

/** O valor de um lançamento, na faixa que as constraints do banco aceitam. */
export function dinheiro(valor: unknown): number | null {
  const convertido = numero(valor)
  if (convertido === null) return null
  // Duas casas: é a escala de `numeric(12,2)`. Arredondar aqui é o que evita o
  // "12.339999999999998" que um modelo às vezes produz virar erro de constraint.
  const emCentavos = Math.round(convertido * 100)
  if (emCentavos < 1 || emCentavos > 999_999_999) return null
  return emCentavos / 100
}

export function moeda(valor: unknown): Moeda {
  return valor === 'USD' ? 'USD' : 'BRL'
}

/** Um caminho de categoria (`['Carro', 'Gasolina']`), já limpo. */
export function caminho(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null
  const nomes = valor.map((parte) => texto(parte, 60)).filter((parte): parte is string => !!parte)
  return nomes.length === 0 || nomes.length > 3 ? null : nomes
}

// -----------------------------------------------------------------------------
// A árvore, na memória
// -----------------------------------------------------------------------------

/**
 * O caminho do topo até a categoria: `['Carro', 'Gasolina']`.
 *
 * É o que o cartão de confirmação mostra, e é o ponto do cartão: só a folha
 * ("Gasolina") não deixa o usuário conferir se a IA acertou a gaveta — existem
 * duas Gasolinas plausíveis em qualquer árvore com dois carros.
 */
export function caminhoDaCategoria(
  categorias: CategoriaConhecida[],
  id: number | null,
): string[] | null {
  if (id === null) return null
  return categorias.find((categoria) => categoria.id === id)?.caminho ?? null
}

/**
 * A categoria e todos os descendentes dela.
 *
 * É o que faz "quanto gastei com Carro" somar `Carro › Gasolina` e
 * `Carro › Seguro` junto. Quem registra escolhe a folha, então filtrar só pelo id
 * exato quase sempre devolveria zero — e um zero com cara de resposta é pior do
 * que um erro.
 *
 * A conta é feita AQUI, e não no banco, porque a árvore inteira já está na
 * memória (ela foi para o prompt): pedir a recursiva ao Postgres a cada pergunta
 * seria refazer, por consulta, um trabalho já pronto.
 */
/**
 * Traz para o contexto uma categoria que o prompt ainda não conhecia — **e todas
 * as mães dela que também faltarem**.
 *
 * A subida é o ponto, e ela existe por causa de um defeito real: `Casa › Mercado`
 * nasce numa chamada só de `category_resolve_path`, que cria os DOIS degraus e
 * devolve o id da folha. Lembrando só a folha, a mãe `Casa` continuava ausente do
 * contexto, `caminho` era montado como `[...(mae?.caminho ?? []), nome]` e o
 * `mae?.caminho ?? []` caía no vazio — então o cartão exibia "Mercado" onde
 * deveria exibir "Casa › Mercado". A hierarquia, que é justamente o que o cartão
 * existe para mostrar, sumia exatamente no caso em que ela era novidade.
 *
 * As mães entram ANTES da filha: o caminho de cada uma é montado a partir do
 * caminho da sua própria mãe, então a ordem de inserção é o que faz a corrente
 * fechar.
 *
 * Tudo o que esta função acrescenta é, por definição, categoria que não estava na
 * árvore enviada ao prompt — ou seja, **nasceu neste turno**. Por isso é aqui que
 * `categoriasCriadas` é alimentado, e não em cada chamador: um chamador que
 * esquecesse de marcar faria a trava do laço acusar mentira numa criação legítima.
 */
export async function lembrarCategoria(
  ctx: ContextoDaFerramenta,
  id: number,
): Promise<void> {
  const conhecida = (procurado: number) =>
    ctx.categorias.some((categoria) => categoria.id === procurado)

  if (conhecida(id)) return

  interface LinhaDeCategoria {
    id: number
    parent_id: number | null
    name: string
    color: string
    is_active: boolean
  }

  // Sobe da folha até topar com uma categoria já conhecida (ou com a raiz),
  // empilhando o que falta. O teto de saltos é a rede contra um ciclo que o banco
  // não deveria permitir: sem ele, a Edge Function ficaria presa aqui.
  const faltando: LinhaDeCategoria[] = []
  let alvo: number | null = id

  for (let saltos = 0; alvo !== null && !conhecida(alvo) && saltos < 10; saltos += 1) {
    const { data } = await ctx.cliente
      .from('category')
      .select('id, parent_id, name, color, is_active')
      .eq('id', alvo)
      .maybeSingle()

    if (!data) break

    const linha = data as LinhaDeCategoria
    faltando.push(linha)
    alvo = linha.parent_id
  }

  // Do topo para baixo, para cada uma achar a mãe já inserida.
  for (const linha of faltando.reverse()) {
    if (conhecida(linha.id)) continue

    const mae = ctx.categorias.find((categoria) => categoria.id === linha.parent_id)

    ctx.categorias.push({
      id: linha.id,
      paiId: linha.parent_id,
      nome: linha.name,
      cor: linha.color,
      ativa: linha.is_active,
      caminho: [...(mae?.caminho ?? []), linha.name],
    })

    ctx.categoriasCriadas.push(linha.id)
  }
}

export function idsDaSubarvore(categorias: CategoriaConhecida[], raiz: number): number[] {
  const ids = [raiz]

  // Largura, e não recursão: a árvore é rasa, e uma fila deixa o percurso imune a
  // um ciclo que o banco não deveria permitir mas que travaria a função aqui.
  for (let i = 0; i < ids.length; i++) {
    for (const categoria of categorias) {
      if (categoria.paiId === ids[i] && !ids.includes(categoria.id)) ids.push(categoria.id)
    }
  }

  return ids
}

// -----------------------------------------------------------------------------
// Dinheiro
// -----------------------------------------------------------------------------

/**
 * Soma uma lista de valores em reais **passando por centavos inteiros**.
 *
 * É a mesma regra, do lado do servidor. O `number` do JavaScript é
 * binário: `0.1 + 0.2` dá `0.30000000000000004`, e o erro se acumula ao longo de
 * uma lista. Num total de mês somado assim, a resposta da IA sairia com um
 * centavo de diferença do que a tela de Gastos mostra — e o usuário confiaria
 * numa das duas, sem saber qual.
 *
 * O espelho disto no front é `somar`, em `src/shared/utils/dinheiro.ts`.
 */
export function somar(valores: number[]): number {
  return valores.reduce((total, valor) => total + Math.round(valor * 100), 0) / 100
}

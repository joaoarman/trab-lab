// =============================================================================
// As ferramentas de GASTOS — o módulo mais rico da conversa.
//
// É aqui que a promessa do produto acontece: "gastei 20 no posto" vira um gasto
// de R$ 20 em `Carro › Gasolina`, com a categoria criada na hora se ela não
// existia. Todo o resto do sistema é revisão do que passou por estas funções.
//
// ## Cinco ferramentas, e o porquê de cada uma ser separada
//
//   registrar_gasto   — escreve. É a que roda o dia inteiro.
//   editar_gasto      — escreve. Separada porque exige um id, e exigir um id é o
//                       que impede a IA de "corrigir" um gasto que ela achou que
//                       era o certo.
//   excluir_gasto     — escreve. Idem, com a regra de confirmação do prompt.
//   consultar_gastos  — lê a LISTA (e o total do recorte junto).
//   resumo_de_gastos  — lê o TOTAL POR CATEGORIA, com a subárvore somada.
//
// As duas de leitura são separadas porque respondem a perguntas diferentes:
// "quais gastos eu tive?" quer linhas; "onde eu mais gastei?" quer um ranking. Uma
// ferramenta só devolvendo as duas coisas mandaria a lista inteira para o prompt
// toda vez que o usuário só quisesse um número — e cada linha dessa lista é token
// pago.
//
// ## Nenhuma delas escreve `amount_brl`
//
// A conversão de dólar para real é da trigger `expense_guard`, no banco, e o
// cliente não tem grant na coluna. A IA manda valor, moeda e cotação — como a
// tela manda. Se a conta morasse aqui, bastaria um bug de arredondamento no
// modelo para o extrato passar a mentir de um jeito invisível.
// =============================================================================
import {
  type CategoriaConhecida,
  type ContextoDaFerramenta,
  type Ferramenta,
  caminho,
  caminhoDaCategoria,
  dinheiro,
  idsDaSubarvore,
  inteiro,
  lembrarCategoria,
  limitesDoPeriodo,
  periodoOpcional,
  moeda,
  numero,
  paraIso,
  texto,
  traduzirErroDoBanco,
} from './comum.ts'
import { resolverCotacao } from './cotacao.ts'

/** As colunas lidas da `expense`. Nada de `select('*')`. */
const COLUNAS =
  'id, category_id, name, amount, currency, exchange_rate, amount_brl, occurred_at, created_at'

interface LinhaDeGasto {
  id: number
  category_id: number | null
  name: string
  // `numeric` chega do PostgREST como TEXTO ('50.00'): é assim que o Postgres
  // protege a precisão que o float do JSON perderia. A conversão é na fronteira.
  amount: string | number
  currency: 'BRL' | 'USD'
  exchange_rate: string | number | null
  amount_brl: string | number
  occurred_at: string
  created_at: string
}

/**
 * O gasto do jeito que o MODELO precisa lê-lo.
 *
 * A categoria vai como caminho legível (`"Carro › Gasolina"`), e não como id: o
 * modelo vai reescrever isso numa frase para o usuário, e um id no meio de uma
 * resposta é ruído. O id vai junto, num campo próprio, porque é dele que uma
 * edição ou exclusão seguinte vai precisar.
 */
function paraModelo(linha: LinhaDeGasto, categorias: CategoriaConhecida[]) {
  const trilha = caminhoDaCategoria(categorias, linha.category_id)

  return {
    id: linha.id,
    nome: linha.name,
    valor: Number(linha.amount),
    moeda: linha.currency,
    cotacao: linha.exchange_rate === null ? null : Number(linha.exchange_rate),
    valor_em_reais: Number(linha.amount_brl),
    categoria: trilha ? trilha.join(' › ') : null,
    categoria_id: linha.category_id,
    ocorreu_em: linha.occurred_at,
  }
}

// -----------------------------------------------------------------------------
// A categoria de um gasto
// -----------------------------------------------------------------------------

/**
 * O `category_id` a gravar, a partir do que o modelo mandou.
 *
 * Aceita as duas formas de propósito:
 *
 *   • **`categoria`** (o caminho em nomes) — a forma completa. Chama
 *     `category_resolve_path`, que reaproveita cada degrau existente e cria só o
 *     que falta. É a função que faz o usuário nunca precisar abrir a tela de
 *     Categorias antes de registrar.
 *   • **`categoria_id`** — o atalho, quando a IA reconheceu uma categoria da lista
 *     do prompt e nada precisa ser criado.
 *   • **nenhuma das duas** — gasto sem categoria. Caso legítimo: melhor um gasto
 *     sem gaveta do que um gasto não registrado.
 *
 * ## O CAMINHO GANHA DO ID quando os dois vêm juntos
 *
 * Esta precedência já foi a inversa, e o estrago foi grande: o modelo mandava
 * `categoria_id` (uma categoria antiga) **e** `categoria: ["Casa","Mercado"]`, o
 * código ficava com o id e **jogava o caminho fora sem dizer nada**. O gasto caía
 * na gaveta velha, a categoria nova nunca nascia, e a IA — que tinha pedido a
 * criação — anunciava ao usuário uma categoria que não existia em lugar nenhum.
 * Um defeito invisível dos dois lados: nem o modelo sabia que fora ignorado, nem o
 * usuário tinha como desconfiar.
 *
 * Agora o caminho vence, e é a escolha segura das duas: `category_resolve_path`
 * **reaproveita** o que já existe, então um caminho que aponta para uma categoria
 * existente resolve exatamente para ela. Ou seja, obedecer ao caminho nunca cria
 * duplicata — enquanto obedecer ao id descarta uma intenção que o modelo declarou.
 *
 * Uma categoria recém-criada é acrescentada ao contexto na hora, para que as
 * ferramentas seguintes DO MESMO TURNO já a enxerguem — sem isso, "gastei 20 no
 * posto e 40 no mercado" criaria a árvore no primeiro gasto e não a acharia no
 * segundo.
 */
async function resolverCategoria(
  ctx: ContextoDaFerramenta,
  args: Record<string, unknown>,
): Promise<number | null> {
  const trilha = caminho(args.categoria)

  if (!trilha) {
    const id = inteiro(args.categoria_id)
    return id !== null && id > 0 ? id : null
  }

  const { data, error } = await ctx.cliente.rpc('category_resolve_path', {
    p_path: trilha,
    p_color: texto(args.categoria_cor, 7),
  })
  if (error) traduzirErroDoBanco(error)

  const resolvido = Number(data)
  if (!Number.isFinite(resolvido)) return null

  // `lembrarCategoria` traz a folha E as mães que faltarem, e marca cada uma como
  // nascida neste turno — `category_resolve_path` devolve só o id, sem dizer o que
  // criou e o que reaproveitou. Quem não estava na árvore do prompt é novo.
  await lembrarCategoria(ctx, resolvido)
  return resolvido
}

// -----------------------------------------------------------------------------
// registrar_gasto
// -----------------------------------------------------------------------------

const registrar_gasto: Ferramenta = {
  escreve: true,
  schema: {
    type: 'function',
    function: {
      name: 'registrar_gasto',
      description:
        'Registra um gasto (dinheiro que SAIU). Use sempre que o usuário disser que gastou, pagou, comprou ou que algo custou. Vários gastos na mesma mensagem = várias chamadas desta ferramenta, no mesmo turno. O cartão de confirmação é desenhado pelo sistema — não o escreva em texto.',
      parameters: {
        type: 'object',
        properties: {
          nome: {
            type: 'string',
            description:
              'Onde/no que foi o gasto, curto e concreto: "posto de gasolina", "mercado", "almoço". NÃO repita a categoria aqui — a categoria diz a gaveta, isto diz o episódio.',
          },
          valor: {
            type: 'number',
            description: 'O valor na moeda de `moeda`. 20 reais = 20. Nunca em centavos.',
          },
          moeda: {
            type: 'string',
            enum: ['BRL', 'USD'],
            description: 'Padrão BRL. Só use USD se o usuário falar em dólar explicitamente.',
          },
          cotacao: {
            type: 'number',
            description:
              'Quantos reais valia 1 dólar. DEIXE VAZIO: o sistema busca a cotação do momento sozinho. Só preencha se o próprio usuário disser a cotação que usou.',
          },
          categoria: {
            type: 'array',
            items: { type: 'string' },
            description:
              'A categoria, como caminho do topo até a folha: ["Casa", "Mercado"] — ou um nome só, ["Mercado"]. Os degraus que já existirem são reaproveitados; o que faltar é CRIADO. Máximo 3 degraus. USE ESTE CAMPO sempre que nenhuma categoria da lista do contexto for de fato sobre este gasto: criar a gaveta certa é o comportamento esperado, não a exceção. Se você mandar este campo, ele MANDA — `categoria_id` é ignorado.',
          },
          categoria_id: {
            type: 'integer',
            description:
              'Atalho para uma categoria da lista do contexto, quando NADA precisa ser criado — e só se ela for realmente sobre este gasto. Um supermercado NÃO vai em "Carro" nem em "Saúde" só porque são as que existem: se nenhuma serve, use `categoria` e crie. NÃO mande os dois campos. Deixe os dois vazios para lançar sem categoria.',
          },
          categoria_cor: {
            type: 'string',
            description:
              'Cor hexadecimal (#rrggbb) das categorias criadas por `categoria`. Opcional — sem ela, o padrão do sistema.',
          },
          ocorreu_em: {
            type: 'string',
            description:
              'Quando o gasto ACONTECEU, em AAAA-MM-DD ou AAAA-MM-DDTHH:mm, no fuso do usuário. Vazio = agora. Use a data de hoje do contexto para resolver "ontem", "sexta passada" etc. Nunca no futuro.',
          },
        },
        required: ['nome', 'valor'],
      },
    },
  },

  async executar(ctx, args) {
    const nome = texto(args.nome, 80)
    if (!nome) throw new Error('O gasto precisa de um nome (1 a 80 caracteres).')

    const valor = dinheiro(args.valor)
    if (valor === null) {
      throw new Error('Valor inválido. Aceito de R$ 0,01 a R$ 9.999.999,99, na moeda informada.')
    }

    const moedaDoGasto = moeda(args.moeda)
    const cotacao = await resolverCotacao(moedaDoGasto, numero(args.cotacao))

    // Sem data dita, é agora. `new Date()` aqui é o instante real, e instante não
    // tem fuso — o fuso só importa quando a IA diz um dia de calendário.
    const ocorreuEm =
      texto(args.ocorreu_em, 25) === null
        ? new Date().toISOString()
        : paraIso(String(args.ocorreu_em), ctx.fusoEmMinutos)

    if (!ocorreuEm) throw new Error('Data inválida. Use AAAA-MM-DD ou AAAA-MM-DDTHH:mm.')
    if (new Date(ocorreuEm).getTime() > Date.now() + 60_000) {
      throw new Error('Não dá para registrar um gasto no futuro. Confirme a data com o usuário.')
    }

    const categoriaId = await resolverCategoria(ctx, args)

    const { data, error } = await ctx.cliente
      .from('expense')
      .insert({
        name: nome,
        amount: valor,
        currency: moedaDoGasto,
        exchange_rate: cotacao,
        category_id: categoriaId,
        occurred_at: ocorreuEm,
      })
      .select(COLUNAS)
      .single()

    if (error) traduzirErroDoBanco(error)

    const linha = data as LinhaDeGasto
    ctx.recibos.push({
      acao: 'criado',
      tipo: 'gasto',
      id: linha.id,
      nome: linha.name,
      valor: Number(linha.amount),
      moeda: linha.currency,
      cotacao: linha.exchange_rate === null ? null : Number(linha.exchange_rate),
      valorEmBrl: Number(linha.amount_brl),
      categoria: caminhoDaCategoria(ctx.categorias, linha.category_id),
      categoriaCriada:
        linha.category_id !== null && ctx.categoriasCriadas.includes(linha.category_id),
      aconteceuEm: linha.occurred_at,
      criadoEm: linha.created_at,
    })

    // O que volta para o modelo é o mínimo: ele não precisa reescrever nada disso
    // (o cartão já vai na tela), só saber que deu certo e com que id.
    return { ok: true, id: linha.id, valor_em_reais: Number(linha.amount_brl) }
  },
}

// -----------------------------------------------------------------------------
// editar_gasto
// -----------------------------------------------------------------------------

const editar_gasto: Ferramenta = {
  escreve: true,
  schema: {
    type: 'function',
    function: {
      name: 'editar_gasto',
      description:
        'Altera um gasto que já existe. Só quando o usuário pedir com todas as letras ("na verdade foram 45", "troca a categoria"). Mande APENAS os campos que mudam — o que não vier fica como está. Se você não sabe o id, consulte antes.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'O id do gasto, obtido numa consulta.' },
          nome: { type: 'string' },
          valor: { type: 'number', description: 'Na moeda de `moeda` (ou na atual, se não mudar).' },
          moeda: { type: 'string', enum: ['BRL', 'USD'] },
          cotacao: {
            type: 'number',
            description: 'Deixe vazio ao trocar para USD: o sistema busca a do momento.',
          },
          categoria: {
            type: 'array',
            items: { type: 'string' },
            description: 'Caminho novo da categoria, criando o que faltar.',
          },
          categoria_id: { type: 'integer', description: 'Id de uma categoria existente.' },
          sem_categoria: {
            type: 'boolean',
            description: 'True para TIRAR a categoria do gasto, deixando-o sem gaveta.',
          },
          ocorreu_em: { type: 'string', description: 'AAAA-MM-DD ou AAAA-MM-DDTHH:mm.' },
        },
        required: ['id'],
      },
    },
  },

  async executar(ctx, args) {
    const id = inteiro(args.id)
    if (id === null || id <= 0) throw new Error('Informe o id do gasto a editar.')

    // A leitura ANTES do update não é só conveniência: o gasto pode estar em USD e
    // ter só o valor alterado, e nesse caso a cotação a usar é a que já está lá.
    // Recalcular a cotação de hoje reescreveria o passado — a conversão de um
    // gasto de março tem de continuar valendo o dólar de março.
    const { data: atualBruto, error: erroAoLer } = await ctx.cliente
      .from('expense')
      .select(COLUNAS)
      .eq('id', id)
      .maybeSingle()

    if (erroAoLer) traduzirErroDoBanco(erroAoLer)
    if (!atualBruto) throw new Error('Não existe gasto com esse id (ou ele já foi excluído).')

    const atual = atualBruto as LinhaDeGasto
    const mudancas: Record<string, unknown> = {}

    const nome = texto(args.nome, 80)
    if (nome) mudancas.name = nome

    const valor = args.valor === undefined ? null : dinheiro(args.valor)
    if (args.valor !== undefined && valor === null) {
      throw new Error('Valor inválido. Aceito de R$ 0,01 a R$ 9.999.999,99.')
    }
    if (valor !== null) mudancas.amount = valor

    if (args.moeda !== undefined) {
      const moedaNova = moeda(args.moeda)
      mudancas.currency = moedaNova
      // A moeda mudou: a cotação antiga não vale mais para ela. Ou o usuário disse
      // a nova, ou o sistema busca — e em BRL ela é zerada.
      mudancas.exchange_rate = await resolverCotacao(moedaNova, numero(args.cotacao))
    } else if (args.cotacao !== undefined && atual.currency !== 'BRL') {
      mudancas.exchange_rate = numero(args.cotacao)
    }

    if (args.ocorreu_em !== undefined) {
      const quando = paraIso(String(args.ocorreu_em), ctx.fusoEmMinutos)
      if (!quando) throw new Error('Data inválida. Use AAAA-MM-DD ou AAAA-MM-DDTHH:mm.')
      if (new Date(quando).getTime() > Date.now() + 60_000) {
        throw new Error('Não dá para datar um gasto no futuro.')
      }
      mudancas.occurred_at = quando
    }

    if (args.sem_categoria === true) {
      mudancas.category_id = null
    } else if (args.categoria !== undefined || args.categoria_id !== undefined) {
      mudancas.category_id = await resolverCategoria(ctx, args)
    }

    if (Object.keys(mudancas).length === 0) {
      throw new Error('Nada a alterar: nenhum campo novo foi informado.')
    }

    const { data, error } = await ctx.cliente
      .from('expense')
      .update(mudancas)
      .eq('id', id)
      .select(COLUNAS)
      .single()

    if (error) traduzirErroDoBanco(error)

    const linha = data as LinhaDeGasto
    ctx.recibos.push({
      acao: 'editado',
      tipo: 'gasto',
      id: linha.id,
      nome: linha.name,
      valor: Number(linha.amount),
      moeda: linha.currency,
      cotacao: linha.exchange_rate === null ? null : Number(linha.exchange_rate),
      valorEmBrl: Number(linha.amount_brl),
      categoria: caminhoDaCategoria(ctx.categorias, linha.category_id),
      categoriaCriada:
        linha.category_id !== null && ctx.categoriasCriadas.includes(linha.category_id),
      aconteceuEm: linha.occurred_at,
      criadoEm: linha.created_at,
    })

    return { ok: true, id: linha.id, valor_em_reais: Number(linha.amount_brl) }
  },
}

// -----------------------------------------------------------------------------
// excluir_gasto
// -----------------------------------------------------------------------------

const excluir_gasto: Ferramenta = {
  escreve: true,
  schema: {
    type: 'function',
    function: {
      name: 'excluir_gasto',
      description:
        'Exclui um gasto. NÃO CHAME DE PRIMEIRA: consulte, mostre ao usuário qual gasto é (valor, nome, data) e só chame depois que ele confirmar nesta conversa. Se a busca devolver mais de um candidato, pergunte qual antes.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'O id do gasto, obtido numa consulta.' },
          confirmado: {
            type: 'boolean',
            description:
              'Só true quando o usuário confirmou a exclusão DESTE gasto nesta conversa, ou pediu de forma inequívoca (valor e data batendo com um único registro).',
          },
        },
        required: ['id', 'confirmado'],
      },
    },
  },

  async executar(ctx, args) {
    const id = inteiro(args.id)
    if (id === null || id <= 0) throw new Error('Informe o id do gasto a excluir.')

    // O guarda é do prompt, e este `if` é a segunda camada dele. Não é uma
    // garantia — o modelo pode marcar true —, mas transforma "esqueci de
    // confirmar" em erro visível em vez de gasto apagado em silêncio. A garantia
    // de verdade é o soft-delete: `expense_remove` preenche `deleted_at`, e a
    // linha continua no banco.
    if (args.confirmado !== true) {
      throw new Error(
        'Exclusão não confirmada. Mostre ao usuário qual gasto será apagado e espere ele confirmar.',
      )
    }

    const { data: alvoBruto, error: erroAoLer } = await ctx.cliente
      .from('expense')
      .select(COLUNAS)
      .eq('id', id)
      .maybeSingle()

    if (erroAoLer) traduzirErroDoBanco(erroAoLer)
    if (!alvoBruto) throw new Error('Não existe gasto com esse id (ou ele já foi excluído).')

    const alvo = alvoBruto as LinhaDeGasto

    const { error } = await ctx.cliente.rpc('expense_remove', { p_expense_id: id })
    if (error) traduzirErroDoBanco(error)

    // O cartão do que foi apagado é lido ANTES da exclusão, e é o único registro
    // que sobra na tela do que existia — depois disto a linha some da RLS.
    ctx.recibos.push({
      acao: 'excluido',
      tipo: 'gasto',
      id: alvo.id,
      nome: alvo.name,
      valor: Number(alvo.amount),
      moeda: alvo.currency,
      cotacao: alvo.exchange_rate === null ? null : Number(alvo.exchange_rate),
      valorEmBrl: Number(alvo.amount_brl),
      categoria: caminhoDaCategoria(ctx.categorias, alvo.category_id),
      aconteceuEm: alvo.occurred_at,
      criadoEm: alvo.created_at,
    })

    return { ok: true, id: alvo.id }
  },
}

// -----------------------------------------------------------------------------
// consultar_gastos
// -----------------------------------------------------------------------------

/** Quantos gastos a consulta devolve por padrão, e no teto. */
const LIMITE_PADRAO = 20
const LIMITE_MAXIMO = 50

const consultar_gastos: Ferramenta = {
  schema: {
    type: 'function',
    function: {
      name: 'consultar_gastos',
      description:
        'Lista os gastos (do mais recente para o mais antigo) e devolve o TOTAL em reais junto. Use para "quanto gastei…", "quais foram meus gastos…", "qual foi meu último gasto", e sempre antes de editar ou excluir (é daqui que sai o id). O total já vem somado sobre o recorte inteiro, mesmo que a lista venha cortada pelo limite.',
      parameters: {
        type: 'object',
        properties: {
          de: {
            type: 'string',
            description:
              'Primeiro dia do período, AAAA-MM-DD. Inclusive. OPCIONAL: omita para não ter limite no início.',
          },
          ate: {
            type: 'string',
            description:
              'Último dia do período, AAAA-MM-DD. Inclusive. OPCIONAL: omita para não ter limite no fim. Sem `de` nem `ate`, a busca cobre TODO o histórico — é assim que se responde "qual foi o último gasto que registrei".',
          },
          categoria_id: {
            type: 'integer',
            description:
              'Filtra por uma categoria. Traz os DESCENDENTES junto por padrão — "Carro" soma "Carro › Gasolina".',
          },
          incluir_subcategorias: {
            type: 'boolean',
            description: 'Padrão true. False para somar apenas a categoria exata, sem as filhas.',
          },
          sem_categoria: {
            type: 'boolean',
            description: 'True para trazer SÓ os gastos sem categoria. Ignora `categoria_id`.',
          },
          texto: {
            type: 'string',
            description:
              'Filtra pelo nome do gasto ("posto", "mercado"). Use quando o usuário citar o lugar em vez da categoria.',
          },
          limite: {
            type: 'integer',
            description: `Quantos gastos listar, do mais recente para trás. Padrão ${LIMITE_PADRAO}, máximo ${LIMITE_MAXIMO}. Para "o último gasto", mande 1. O total não depende disto.`,
          },
        },
      },
    },
  },

  async executar(ctx, args) {
    // Sem data nenhuma = todo o histórico. É o que faz "qual foi o último gasto
    // que registrei?" ter resposta: a pergunta não traz recorte, e exigir um
    // obrigava o modelo a inventar um — ou, pior, a responder pelo que ele via na
    // conversa em vez de perguntar ao banco.
    const periodo = periodoOpcional(args.de, args.ate, ctx.fusoEmMinutos)
    if (!periodo) throw new Error('Período inválido. Use AAAA-MM-DD nas datas.')

    const semCategoria = args.sem_categoria === true
    const categoriaId = inteiro(args.categoria_id)
    const comSubarvore = args.incluir_subcategorias !== false

    let ids: number[] | null = null
    if (!semCategoria && categoriaId !== null && categoriaId > 0) {
      ids = comSubarvore ? idsDaSubarvore(ctx.categorias, categoriaId) : [categoriaId]
    }

    const busca = texto(args.texto, 80)
    const limite = Math.min(inteiro(args.limite) ?? LIMITE_PADRAO, LIMITE_MAXIMO)

    let consulta = ctx.cliente
      .from('expense')
      .select(COLUNAS)
      .order('occurred_at', { ascending: false })
      .limit(Math.max(1, limite))

    if (periodo.de) consulta = consulta.gte('occurred_at', periodo.de)
    if (periodo.ate) consulta = consulta.lt('occurred_at', periodo.ate)

    if (semCategoria) consulta = consulta.is('category_id', null)
    else if (ids) consulta = consulta.in('category_id', ids)
    if (busca) consulta = consulta.ilike('name', `%${busca}%`)

    // As duas em paralelo: a lista (limitada, para caber no prompt) e o total (do
    // recorte INTEIRO, somado pelo Postgres). Somar a lista limitada em JavaScript
    // daria um número menor que a verdade, com cara de resposta certa.
    const [lista, relatorio] = await Promise.all([
      consulta,
      ctx.cliente.rpc('expense_report', {
        p_from: periodo.de,
        p_to: periodo.ate,
        p_category_ids: ids,
        p_uncategorized: semCategoria,
        p_search: busca,
      }),
    ])

    if (lista.error) traduzirErroDoBanco(lista.error)
    if (relatorio.error) traduzirErroDoBanco(relatorio.error)

    // `returns table` volta como lista, mesmo com uma linha só.
    const [resumo] = (relatorio.data ?? []) as { total_brl: string | number; quantity: number }[]
    const linhas = (lista.data ?? []) as LinhaDeGasto[]

    return {
      total_em_reais: Number(resumo?.total_brl ?? 0),
      quantidade: resumo?.quantity ?? 0,
      listados: linhas.length,
      gastos: linhas.map((linha) => paraModelo(linha, ctx.categorias)),
    }
  },
}

// -----------------------------------------------------------------------------
// resumo_de_gastos
// -----------------------------------------------------------------------------

const resumo_de_gastos: Ferramenta = {
  schema: {
    type: 'function',
    function: {
      name: 'resumo_de_gastos',
      description:
        'O total gasto no período QUEBRADO POR CATEGORIA. Use para "onde eu mais gastei", "resumo do mês", "gastei mais com o quê". Cada categoria vem com o valor dela sozinha e com o valor somando as subcategorias.',
      parameters: {
        type: 'object',
        properties: {
          de: { type: 'string', description: 'Primeiro dia, AAAA-MM-DD. Inclusive.' },
          ate: { type: 'string', description: 'Último dia, AAAA-MM-DD. Inclusive.' },
        },
        required: ['de', 'ate'],
      },
    },
  },

  async executar(ctx, args) {
    const periodo = limitesDoPeriodo(String(args.de ?? ''), String(args.ate ?? ''), ctx.fusoEmMinutos)
    if (!periodo) throw new Error('Período inválido. Use AAAA-MM-DD nas duas datas.')

    const { data, error } = await ctx.cliente.rpc('expense_by_category', {
      p_from: periodo.de,
      p_to: periodo.ate,
    })
    if (error) traduzirErroDoBanco(error)

    const linhas = (data ?? []) as {
      category_id: number | null
      quantity: number
      total_brl: string | number
    }[]

    // O banco devolve o gasto na categoria DIRETA em que ele foi lançado. Quem rola
    // para as mães é aqui, porque é aqui que a árvore está — e é a rolagem que
    // responde "quanto gastei com Carro" quando todo lançamento está nas folhas.
    //
    // Em CENTAVOS INTEIROS: um mês tem dezenas de linhas, e somar `number` binário
    // ao longo delas acumula erro. O resultado volta
    // para reais na hora de montar a resposta.
    const diretoEmCentavos = new Map<number, number>()
    const quantidadeDireta = new Map<number, number>()
    let semCategoriaEmCentavos = 0
    let semCategoriaQuantidade = 0

    for (const linha of linhas) {
      const centavos = Math.round(Number(linha.total_brl) * 100)
      if (linha.category_id === null) {
        semCategoriaEmCentavos += centavos
        semCategoriaQuantidade += linha.quantity
      } else {
        diretoEmCentavos.set(linha.category_id, centavos)
        quantidadeDireta.set(linha.category_id, linha.quantity)
      }
    }

    const porCategoria = ctx.categorias
      .map((categoria) => {
        const descendentes = idsDaSubarvore(ctx.categorias, categoria.id)
        const comFilhas = descendentes.reduce((soma, id) => soma + (diretoEmCentavos.get(id) ?? 0), 0)
        const quantidade = descendentes.reduce((soma, id) => soma + (quantidadeDireta.get(id) ?? 0), 0)

        return {
          categoria_id: categoria.id,
          categoria: categoria.caminho.join(' › '),
          nivel: categoria.caminho.length,
          total_proprio: (diretoEmCentavos.get(categoria.id) ?? 0) / 100,
          total_com_subcategorias: comFilhas / 100,
          quantidade,
        }
      })
      .filter((item) => item.total_com_subcategorias > 0)
      .sort((a, b) => b.total_com_subcategorias - a.total_com_subcategorias)

    const totalEmCentavos =
      [...diretoEmCentavos.values()].reduce((soma, valor) => soma + valor, 0) +
      semCategoriaEmCentavos

    return {
      // O total soma as categorias DIRETAS, nunca a coluna rolada: somar
      // `total_com_subcategorias` de todo mundo contaria o mesmo dinheiro uma vez
      // na folha e outra em cada mãe acima dela.
      total_em_reais: totalEmCentavos / 100,
      sem_categoria: {
        total: semCategoriaEmCentavos / 100,
        quantidade: semCategoriaQuantidade,
      },
      por_categoria: porCategoria,
    }
  },
}

export const FERRAMENTAS_DE_GASTOS: Record<string, Ferramenta> = {
  registrar_gasto,
  editar_gasto,
  excluir_gasto,
  consultar_gastos,
  resumo_de_gastos,
}

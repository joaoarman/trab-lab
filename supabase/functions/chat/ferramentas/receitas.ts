// =============================================================================
// As ferramentas de RECEITAS — o espelho de Gastos, com uma ausência de propósito.
//
// ## Não há categoria aqui, e não é simplificação
//
// É o que a natureza do dado pede. Gasto se pergunta "em quê?", e a resposta é
// uma árvore inteira (`Carro › Gasolina`), porque um mês tem dezenas de gastos
// espalhados. Receita se pergunta "de onde?", e a resposta cabe no `nome`:
// salário, freela, aluguel. São três ou quatro linhas por mês, e classificar três
// linhas numa hierarquia é fricção sem retorno.
//
// A consequência prática para a IA: **o nome é o único descritor**, então ele
// carrega sozinho o que a hierarquia carrega no gasto. "Freela" é um nome ruim se
// a pessoa tem três clientes; "freela do site da padaria" é o que ela vai
// reconhecer em dezembro.
//
// Quatro ferramentas em vez das cinco de Gastos: não existe `resumo_de_receitas`,
// porque o resumo de gastos é por categoria — e é justamente a categoria que não
// existe aqui. "Quanto recebi no mês" é `consultar_receitas`, que já devolve o
// total do recorte.
// =============================================================================
import {
  type Ferramenta,
  dinheiro,
  inteiro,
  periodoOpcional,
  moeda,
  numero,
  paraIso,
  texto,
  traduzirErroDoBanco,
} from './comum.ts'
import { resolverCotacao } from './cotacao.ts'

/**
 * As colunas lidas da `income`.
 *
 * `created_at` entra, e é a diferença para Gastos: em receita, "registrada em" é
 * dado exibido — a tela mostra as duas datas lado a lado, e a diferença entre
 * elas ("recebi na sexta, lancei na segunda") fica auditável a olho nu.
 */
const COLUNAS = 'id, name, amount, currency, exchange_rate, amount_brl, received_at, created_at'

interface LinhaDeReceita {
  id: number
  name: string
  // `numeric` chega do PostgREST como TEXTO ('500.00'). Conversão na fronteira.
  amount: string | number
  currency: 'BRL' | 'USD'
  exchange_rate: string | number | null
  amount_brl: string | number
  received_at: string
  created_at: string
}

function paraModelo(linha: LinhaDeReceita) {
  return {
    id: linha.id,
    nome: linha.name,
    valor: Number(linha.amount),
    moeda: linha.currency,
    cotacao: linha.exchange_rate === null ? null : Number(linha.exchange_rate),
    valor_em_reais: Number(linha.amount_brl),
    recebida_em: linha.received_at,
  }
}

// -----------------------------------------------------------------------------
// registrar_receita
// -----------------------------------------------------------------------------

const registrar_receita: Ferramenta = {
  escreve: true,
  schema: {
    type: 'function',
    function: {
      name: 'registrar_receita',
      description:
        'Registra uma receita (dinheiro que ENTROU). Use quando o usuário disser que recebeu, que caiu, que lhe pagaram. RECEITA NÃO TEM CATEGORIA — o nome é o único descritor. O cartão de confirmação é desenhado pelo sistema; não o escreva em texto.',
      parameters: {
        type: 'object',
        properties: {
          nome: {
            type: 'string',
            description:
              'De onde veio o dinheiro: "salário", "freela do site", "aluguel do apartamento". Seja específico o bastante para o usuário reconhecer daqui a seis meses — é o único descritor que a receita tem.',
          },
          valor: {
            type: 'number',
            description: 'O valor na moeda de `moeda`. 500 reais = 500. Nunca em centavos.',
          },
          moeda: {
            type: 'string',
            enum: ['BRL', 'USD'],
            description: 'Padrão BRL. Só use USD se o usuário falar em dólar explicitamente.',
          },
          cotacao: {
            type: 'number',
            description:
              'Quantos reais valia 1 dólar. DEIXE VAZIO: o sistema busca a do momento. Só preencha se o usuário disser a cotação que usou.',
          },
          recebida_em: {
            type: 'string',
            description:
              'Quando o dinheiro ENTROU, em AAAA-MM-DD ou AAAA-MM-DDTHH:mm, no fuso do usuário. Vazio = agora. Nunca no futuro.',
          },
        },
        required: ['nome', 'valor'],
      },
    },
  },

  async executar(ctx, args) {
    const nome = texto(args.nome, 80)
    if (!nome) throw new Error('A receita precisa de um nome (1 a 80 caracteres).')

    const valor = dinheiro(args.valor)
    if (valor === null) {
      throw new Error('Valor inválido. Aceito de R$ 0,01 a R$ 9.999.999,99, na moeda informada.')
    }

    const moedaDaReceita = moeda(args.moeda)
    const cotacao = await resolverCotacao(moedaDaReceita, numero(args.cotacao))

    const recebidaEm =
      texto(args.recebida_em, 25) === null
        ? new Date().toISOString()
        : paraIso(String(args.recebida_em), ctx.fusoEmMinutos)

    if (!recebidaEm) throw new Error('Data inválida. Use AAAA-MM-DD ou AAAA-MM-DDTHH:mm.')
    if (new Date(recebidaEm).getTime() > Date.now() + 60_000) {
      throw new Error('Não dá para registrar uma receita no futuro. Confirme a data com o usuário.')
    }

    const { data, error } = await ctx.cliente
      .from('income')
      .insert({
        name: nome,
        amount: valor,
        currency: moedaDaReceita,
        exchange_rate: cotacao,
        received_at: recebidaEm,
      })
      .select(COLUNAS)
      .single()

    if (error) traduzirErroDoBanco(error)

    const linha = data as LinhaDeReceita
    ctx.recibos.push({
      acao: 'criado',
      tipo: 'receita',
      id: linha.id,
      nome: linha.name,
      valor: Number(linha.amount),
      moeda: linha.currency,
      cotacao: linha.exchange_rate === null ? null : Number(linha.exchange_rate),
      valorEmBrl: Number(linha.amount_brl),
      aconteceuEm: linha.received_at,
      criadoEm: linha.created_at,
    })

    return { ok: true, id: linha.id, valor_em_reais: Number(linha.amount_brl) }
  },
}

// -----------------------------------------------------------------------------
// editar_receita
// -----------------------------------------------------------------------------

const editar_receita: Ferramenta = {
  escreve: true,
  schema: {
    type: 'function',
    function: {
      name: 'editar_receita',
      description:
        'Altera uma receita que já existe. Só quando o usuário pedir com todas as letras. Mande APENAS os campos que mudam. Se não sabe o id, consulte antes.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'O id da receita, obtido numa consulta.' },
          nome: { type: 'string' },
          valor: { type: 'number' },
          moeda: { type: 'string', enum: ['BRL', 'USD'] },
          cotacao: {
            type: 'number',
            description: 'Deixe vazio ao trocar para USD: o sistema busca a do momento.',
          },
          recebida_em: { type: 'string', description: 'AAAA-MM-DD ou AAAA-MM-DDTHH:mm.' },
        },
        required: ['id'],
      },
    },
  },

  async executar(ctx, args) {
    const id = inteiro(args.id)
    if (id === null || id <= 0) throw new Error('Informe o id da receita a editar.')

    // Lida antes, pelo mesmo motivo de Gastos: se a receita está em USD e só o
    // valor muda, a cotação a manter é a que já está gravada. Buscar a de hoje
    // reescreveria o passado — o freela de março valeu o dólar de março.
    const { data: atualBruto, error: erroAoLer } = await ctx.cliente
      .from('income')
      .select(COLUNAS)
      .eq('id', id)
      .maybeSingle()

    if (erroAoLer) traduzirErroDoBanco(erroAoLer)
    if (!atualBruto) throw new Error('Não existe receita com esse id (ou ela já foi excluída).')

    const atual = atualBruto as LinhaDeReceita
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
      mudancas.exchange_rate = await resolverCotacao(moedaNova, numero(args.cotacao))
    } else if (args.cotacao !== undefined && atual.currency !== 'BRL') {
      mudancas.exchange_rate = numero(args.cotacao)
    }

    if (args.recebida_em !== undefined) {
      const quando = paraIso(String(args.recebida_em), ctx.fusoEmMinutos)
      if (!quando) throw new Error('Data inválida. Use AAAA-MM-DD ou AAAA-MM-DDTHH:mm.')
      if (new Date(quando).getTime() > Date.now() + 60_000) {
        throw new Error('Não dá para datar uma receita no futuro.')
      }
      mudancas.received_at = quando
    }

    if (Object.keys(mudancas).length === 0) {
      throw new Error('Nada a alterar: nenhum campo novo foi informado.')
    }

    const { data, error } = await ctx.cliente
      .from('income')
      .update(mudancas)
      .eq('id', id)
      .select(COLUNAS)
      .single()

    if (error) traduzirErroDoBanco(error)

    const linha = data as LinhaDeReceita
    ctx.recibos.push({
      acao: 'editado',
      tipo: 'receita',
      id: linha.id,
      nome: linha.name,
      valor: Number(linha.amount),
      moeda: linha.currency,
      cotacao: linha.exchange_rate === null ? null : Number(linha.exchange_rate),
      valorEmBrl: Number(linha.amount_brl),
      aconteceuEm: linha.received_at,
      criadoEm: linha.created_at,
    })

    return { ok: true, id: linha.id, valor_em_reais: Number(linha.amount_brl) }
  },
}

// -----------------------------------------------------------------------------
// excluir_receita
// -----------------------------------------------------------------------------

const excluir_receita: Ferramenta = {
  escreve: true,
  schema: {
    type: 'function',
    function: {
      name: 'excluir_receita',
      description:
        'Exclui uma receita. NÃO CHAME DE PRIMEIRA: consulte, mostre ao usuário qual receita é (valor, nome, data) e só chame depois que ele confirmar nesta conversa.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'O id da receita, obtido numa consulta.' },
          confirmado: {
            type: 'boolean',
            description:
              'Só true quando o usuário confirmou a exclusão DESTA receita nesta conversa, ou pediu de forma inequívoca.',
          },
        },
        required: ['id', 'confirmado'],
      },
    },
  },

  async executar(ctx, args) {
    const id = inteiro(args.id)
    if (id === null || id <= 0) throw new Error('Informe o id da receita a excluir.')

    if (args.confirmado !== true) {
      throw new Error(
        'Exclusão não confirmada. Mostre ao usuário qual receita será apagada e espere ele confirmar.',
      )
    }

    const { data: alvoBruto, error: erroAoLer } = await ctx.cliente
      .from('income')
      .select(COLUNAS)
      .eq('id', id)
      .maybeSingle()

    if (erroAoLer) traduzirErroDoBanco(erroAoLer)
    if (!alvoBruto) throw new Error('Não existe receita com esse id (ou ela já foi excluída).')

    const alvo = alvoBruto as LinhaDeReceita

    const { error } = await ctx.cliente.rpc('income_remove', { p_income_id: id })
    if (error) traduzirErroDoBanco(error)

    ctx.recibos.push({
      acao: 'excluido',
      tipo: 'receita',
      id: alvo.id,
      nome: alvo.name,
      valor: Number(alvo.amount),
      moeda: alvo.currency,
      cotacao: alvo.exchange_rate === null ? null : Number(alvo.exchange_rate),
      valorEmBrl: Number(alvo.amount_brl),
      aconteceuEm: alvo.received_at,
      criadoEm: alvo.created_at,
    })

    return { ok: true, id: alvo.id }
  },
}

// -----------------------------------------------------------------------------
// consultar_receitas
// -----------------------------------------------------------------------------

const LIMITE_PADRAO = 20
const LIMITE_MAXIMO = 50

const consultar_receitas: Ferramenta = {
  schema: {
    type: 'function',
    function: {
      name: 'consultar_receitas',
      description:
        'Lista as receitas (da mais recente para a mais antiga) e devolve o TOTAL em reais junto. Use para "quanto recebi…", "quais foram minhas entradas…", "qual foi minha última receita", e sempre antes de editar ou excluir (é daqui que sai o id). O total é somado sobre o recorte inteiro, mesmo que a lista venha cortada.',
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
              'Último dia do período, AAAA-MM-DD. Inclusive. OPCIONAL: omita para não ter limite no fim. Sem `de` nem `ate`, a busca cobre TODO o histórico.',
          },
          texto: {
            type: 'string',
            description:
              'Filtra pelo nome ("salário", "freela"). É o filtro principal aqui — receita não tem categoria, então o nome é o que separa uma fonte de dinheiro da outra.',
          },
          limite: {
            type: 'integer',
            description: `Quantas listar, da mais recente para trás. Padrão ${LIMITE_PADRAO}, máximo ${LIMITE_MAXIMO}. Para "a última receita", mande 1. O total não depende disto.`,
          },
        },
      },
    },
  },

  async executar(ctx, args) {
    // Sem data nenhuma = todo o histórico. Ver o comentário em `consultar_gastos`.
    const periodo = periodoOpcional(args.de, args.ate, ctx.fusoEmMinutos)
    if (!periodo) throw new Error('Período inválido. Use AAAA-MM-DD nas datas.')

    const busca = texto(args.texto, 80)
    const limite = Math.min(inteiro(args.limite) ?? LIMITE_PADRAO, LIMITE_MAXIMO)

    let consulta = ctx.cliente
      .from('income')
      .select(COLUNAS)
      .order('received_at', { ascending: false })
      .limit(Math.max(1, limite))

    if (periodo.de) consulta = consulta.gte('received_at', periodo.de)
    if (periodo.ate) consulta = consulta.lt('received_at', periodo.ate)

    if (busca) consulta = consulta.ilike('name', `%${busca}%`)

    // A lista e o total em paralelo — o total sai do Postgres, sobre o recorte
    // inteiro. Somar a lista limitada daria um número menor que a verdade.
    const [lista, relatorio] = await Promise.all([
      consulta,
      ctx.cliente.rpc('income_report', {
        p_from: periodo.de,
        p_to: periodo.ate,
        p_search: busca,
      }),
    ])

    if (lista.error) traduzirErroDoBanco(lista.error)
    if (relatorio.error) traduzirErroDoBanco(relatorio.error)

    const [resumo] = (relatorio.data ?? []) as { total_brl: string | number; quantity: number }[]
    const linhas = (lista.data ?? []) as LinhaDeReceita[]

    return {
      total_em_reais: Number(resumo?.total_brl ?? 0),
      quantidade: resumo?.quantity ?? 0,
      listadas: linhas.length,
      receitas: linhas.map(paraModelo),
    }
  },
}

export const FERRAMENTAS_DE_RECEITAS: Record<string, Ferramenta> = {
  registrar_receita,
  editar_receita,
  excluir_receita,
  consultar_receitas,
}

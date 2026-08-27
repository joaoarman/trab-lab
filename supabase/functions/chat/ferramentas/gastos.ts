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
  instanteDoFato,
  numero,
  texto,
  traduzirErroDoBanco,
} from './comum.ts'
import { resolverCotacao } from './cotacao.ts'

const COLUNAS =
  'id, category_id, name, amount, currency, exchange_rate, amount_brl, occurred_at, created_at'

interface LinhaDeGasto {
  id: number
  category_id: number | null
  name: string
  amount: string | number
  currency: 'BRL' | 'USD'
  exchange_rate: string | number | null
  amount_brl: string | number
  occurred_at: string
  created_at: string
}

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

  await lembrarCategoria(ctx, resolvido)
  return resolvido
}

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

    const ocorreuEm =
      texto(args.ocorreu_em, 25) === null
        ? new Date().toISOString()
        : instanteDoFato(args.ocorreu_em, ctx.fusoEmMinutos)

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

    return { ok: true, id: linha.id, valor_em_reais: Number(linha.amount_brl) }
  },
}

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
      mudancas.exchange_rate = await resolverCotacao(moedaNova, numero(args.cotacao))
    } else if (args.cotacao !== undefined && atual.currency !== 'BRL') {
      mudancas.exchange_rate = numero(args.cotacao)
    }

    if (args.ocorreu_em !== undefined) {
      const quando = instanteDoFato(args.ocorreu_em, ctx.fusoEmMinutos)
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

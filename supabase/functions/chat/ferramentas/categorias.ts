import {
  type Ferramenta,
  caminho,
  caminhoDaCategoria,
  inteiro,
  lembrarCategoria,
  texto,
  traduzirErroDoBanco,
} from './comum.ts'

const criar_categoria: Ferramenta = {
  escreve: true,
  schema: {
    type: 'function',
    function: {
      name: 'criar_categoria',
      description:
        'Cria uma categoria (ou um caminho inteiro delas) SEM registrar gasto nenhum. Use só quando o usuário pedir a categoria em si ("cria uma categoria de Pets"). Para classificar um gasto, NÃO use esta: passe o caminho direto em `registrar_gasto`, que já cria o que faltar.',
      parameters: {
        type: 'object',
        properties: {
          caminho: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Do topo até a folha: ["Casa", "Mercado"]. Os degraus existentes são reaproveitados; só o que falta é criado. No máximo 3 degraus.',
          },
          cor: {
            type: 'string',
            description:
              'Cor hexadecimal (#rrggbb) das categorias criadas. Opcional — sem ela, o padrão do sistema.',
          },
        },
        required: ['caminho'],
      },
    },
  },

  async executar(ctx, args) {
    const trilha = caminho(args.caminho)
    if (!trilha) {
      throw new Error('Caminho inválido. Mande de 1 a 3 nomes, do topo até a folha.')
    }

    const cor = texto(args.cor, 7)
    if (cor && !/^#[0-9a-fA-F]{6}$/.test(cor)) {
      throw new Error('Cor inválida. Use hexadecimal no formato #rrggbb.')
    }

    const { data, error } = await ctx.cliente.rpc('category_resolve_path', {
      p_path: trilha,
      p_color: cor ? cor.toLowerCase() : null,
    })
    if (error) traduzirErroDoBanco(error)

    const id = Number(data)
    if (!Number.isFinite(id)) throw new Error('Não foi possível criar a categoria.')

    const { data: linhaBruta } = await ctx.cliente
      .from('category')
      .select('name, color, created_at')
      .eq('id', id)
      .maybeSingle()

    const linha = (linhaBruta ?? null) as {
      name: string
      color: string
      created_at: string
    } | null

    await lembrarCategoria(ctx, id)

    ctx.recibos.push({
      acao: 'criado',
      tipo: 'categoria',
      id,
      nome: linha?.name ?? trilha[trilha.length - 1],
      categoria: caminhoDaCategoria(ctx.categorias, id) ?? trilha,
      cor: linha?.color,
      criadoEm: linha?.created_at ?? new Date().toISOString(),
    })

    return { ok: true, id, caminho: trilha.join(' › ') }
  },
}

const renomear_categoria: Ferramenta = {
  escreve: true,
  schema: {
    type: 'function',
    function: {
      name: 'renomear_categoria',
      description:
        'Renomeia e/ou repinta uma categoria existente. NÃO move a categoria de lugar na árvore — mudar a mãe é pela tela de Categorias.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: 'O id da categoria (está na lista do contexto).',
          },
          nome: { type: 'string', description: 'O nome novo, de 1 a 60 caracteres.' },
          cor: { type: 'string', description: 'Cor hexadecimal nova (#rrggbb).' },
        },
        required: ['id'],
      },
    },
  },

  async executar(ctx, args) {
    const id = inteiro(args.id)
    if (id === null || id <= 0) throw new Error('Informe o id da categoria.')

    const mudancas: Record<string, unknown> = {}

    const nome = texto(args.nome, 60)
    if (nome) mudancas.name = nome

    const cor = texto(args.cor, 7)
    if (cor) {
      if (!/^#[0-9a-fA-F]{6}$/.test(cor)) {
        throw new Error('Cor inválida. Use hexadecimal no formato #rrggbb.')
      }
      mudancas.color = cor.toLowerCase()
    }

    if (Object.keys(mudancas).length === 0) {
      throw new Error('Nada a alterar: informe um nome novo, uma cor nova, ou os dois.')
    }

    const { data, error } = await ctx.cliente
      .from('category')
      .update(mudancas)
      .eq('id', id)
      .select('id, parent_id, name, color, created_at')
      .maybeSingle()

    if (error) traduzirErroDoBanco(error)
    if (!data) throw new Error('Não existe categoria com esse id (ou ela já foi excluída).')

    const linha = data as {
      id: number
      parent_id: number | null
      name: string
      color: string
      created_at: string
    }

    const conhecida = ctx.categorias.find((categoria) => categoria.id === linha.id)
    if (conhecida) {
      conhecida.nome = linha.name
      conhecida.cor = linha.color
      conhecida.caminho = [...conhecida.caminho.slice(0, -1), linha.name]
    }

    ctx.recibos.push({
      acao: 'editado',
      tipo: 'categoria',
      id: linha.id,
      nome: linha.name,
      categoria: caminhoDaCategoria(ctx.categorias, linha.id),
      cor: linha.color,
      criadoEm: linha.created_at,
    })

    return { ok: true, id: linha.id, nome: linha.name }
  },
}

const excluir_categoria: Ferramenta = {
  escreve: true,
  schema: {
    type: 'function',
    function: {
      name: 'excluir_categoria',
      description:
        'Remove uma categoria. Quem decide o destino é o SISTEMA: sem gasto nem subcategoria pendurada, ela é EXCLUÍDA; com qualquer coisa pendurada, ela e a subárvore inteira são DESATIVADAS (saem da árvore e vão para o submenu "Desativadas", de onde podem voltar). A ferramenta devolve qual dos dois aconteceu — conte ao usuário o que de fato foi. Confirme com ele antes de chamar.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'O id da categoria (está na lista do contexto).' },
          confirmado: {
            type: 'boolean',
            description: 'Só true quando o usuário confirmou a remoção DESTA categoria.',
          },
        },
        required: ['id', 'confirmado'],
      },
    },
  },

  async executar(ctx, args) {
    const id = inteiro(args.id)
    if (id === null || id <= 0) throw new Error('Informe o id da categoria.')

    if (args.confirmado !== true) {
      throw new Error(
        'Remoção não confirmada. Diga ao usuário qual categoria será removida e espere ele confirmar.',
      )
    }

    const conhecida = ctx.categorias.find((categoria) => categoria.id === id)

    const { data, error } = await ctx.cliente.rpc('category_remove', { p_category_id: id })
    if (error) traduzirErroDoBanco(error)

    const excluida = data === 'deleted'

    ctx.recibos.push({
      acao: excluida ? 'excluido' : 'desativado',
      tipo: 'categoria',
      id,
      nome: conhecida?.nome ?? '',
      categoria: conhecida?.caminho ?? null,
      cor: conhecida?.cor,
      criadoEm: new Date().toISOString(),
    })

    return {
      ok: true,
      id,
      resultado: excluida
        ? 'excluida'
        : 'desativada (ela tinha gastos ou subcategorias; foi para o submenu "Desativadas" com a subárvore inteira, e pode voltar de lá)',
    }
  },
}

export const FERRAMENTAS_DE_CATEGORIAS: Record<string, Ferramenta> = {
  criar_categoria,
  renomear_categoria,
  excluir_categoria,
}

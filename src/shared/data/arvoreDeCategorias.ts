import type { Categoria, NoDeCategoria } from '@/shared/data/model'

/**
 * A forma de árvore das categorias — o passo entre o que o banco devolve e o
 * que a tela desenha.
 *
 * Mora em `shared/data` porque a hierarquia de categorias é a **espinha do
 * sistema inteiro**, não um detalhe de uma tela: Categorias a desenha, Gastos e
 * Receitas a usam para escolher e para filtrar (filtrar por `Carro` tem de
 * trazer `Carro › Gasolina` junto) e o Chat vai usá-la para achar-ou-criar a
 * categoria de um gasto ditado. Fosse pasta de um módulo, os outros três
 * reescreveriam a mesma travessia de árvore, e as quatro versões divergiriam no
 * primeiro caso de canto.
 *
 * Não é uma consulta: são funções **puras**, sem rede e sem estado. O banco manda
 * uma **lista plana** (que é o formato certo para trafegar: sem repetição e sem
 * aninhamento a serializar) e aqui ela vira a árvore que os componentes percorrem.
 *
 * Também é o único lugar que sabe **separar o que está ativo do que está
 * desativado**. Essa separação é uma regra de leitura da tela, não do banco: a
 * `category` guarda um `is_active` por linha, e é aqui que ele vira "esta
 * subárvore inteira mora no submenu Desativadas".
 */

/**
 * Monta a árvore a partir da lista plana. Devolve as categorias de topo.
 *
 * Interna: quem o módulo consome é `separarPorEstado`, porque a árvore crua
 * (com ativas e desativadas misturadas) não é o que nenhuma tela desenha.
 *
 * A ordem de cada nível é a ordem de chegada da lista — que vem ordenada por
 * nome do banco. Assim a ordenação é decidida num lugar só, na query.
 *
 * Uma categoria cuja mãe não esteja na lista é tratada como **de topo**. Não
 * deveria acontecer (a RLS devolve a árvore inteira do perfil, e o banco impede
 * mãe excluída), mas o custo de sustentar isso é uma linha, e a alternativa
 * seria a categoria sumir da tela sem nenhum aviso.
 */
function montarArvore(categorias: Categoria[]): NoDeCategoria[] {
  const nos = new Map<number, NoDeCategoria>()
  for (const categoria of categorias) {
    nos.set(categoria.id, { ...categoria, filhas: [] })
  }

  const topo: NoDeCategoria[] = []
  for (const categoria of categorias) {
    const no = nos.get(categoria.id)!
    const mae = categoria.paiId === null ? undefined : nos.get(categoria.paiId)
    if (mae) mae.filhas.push(no)
    else topo.push(no)
  }

  return topo
}

/**
 * Divide a árvore nas duas listas que a tela mostra.
 *
 * `ativas` é a árvore principal, já **sem** as desativadas. `desativadas` são os
 * **topos** de cada região desativada, cada um com a subárvore inteira pendurada
 * — porque é assim que elas saem e voltam: uma categoria desativada arrasta as
 * descendentes junto, e o banco sustenta esse invariante.
 *
 * Repare que uma subcategoria desativada aparece como raiz do submenu, mesmo com
 * a mãe ativa. É o certo: o submenu lista o que foi tirado da árvore, e o de onde
 * veio é dito pelo caminho (`caminhoAte`), não pelo aninhamento.
 */
export function separarPorEstado(categorias: Categoria[]): {
  ativas: NoDeCategoria[]
  desativadas: NoDeCategoria[]
} {
  const arvore = montarArvore(categorias)
  return { ativas: podarInativas(arvore), desativadas: topoDasInativas(arvore) }
}

function podarInativas(nos: NoDeCategoria[]): NoDeCategoria[] {
  return nos
    .filter((no) => no.ativa)
    .map((no) => ({ ...no, filhas: podarInativas(no.filhas) }))
}

function topoDasInativas(nos: NoDeCategoria[]): NoDeCategoria[] {
  return nos.flatMap((no) => (no.ativa ? topoDasInativas(no.filhas) : [no]))
}

/**
 * O caminho da raiz até a categoria, inclusive — `[Casa, Mercado, Feira]`.
 *
 * É o que dá contexto quando a categoria aparece fora do lugar dela na árvore:
 * o cabeçalho da modal de nova subcategoria, a linha do submenu "Desativadas" e
 * a confirmação de exclusão. Sem ele, "Feira" sozinho não diz de qual Mercado se
 * trata quando existe mais de um.
 */
export function caminhoAte(categorias: Categoria[], id: number): Categoria[] {
  const porId = new Map(categorias.map((categoria) => [categoria.id, categoria]))

  const caminho: Categoria[] = []
  let atual = porId.get(id)
  // O `size` como teto é a rede contra um ciclo nos dados: o banco impede que um
  // se forme, mas um `while` que sobe por ponteiros não deve depender disso para
  // terminar — travaria a aba inteira.
  while (atual && caminho.length <= porId.size) {
    caminho.unshift(atual)
    atual = atual.paiId === null ? undefined : porId.get(atual.paiId)
  }

  return caminho
}

/** Quantas categorias há nesta subárvore, contando a raiz. */
export function tamanhoDaSubarvore(no: NoDeCategoria): number {
  return 1 + no.filhas.reduce((total, filha) => total + tamanhoDaSubarvore(filha), 0)
}

/**
 * Todos os ids da subárvore de uma categoria — **ela inclusive**.
 *
 * É o que faz "quanto gastei com Carro?" somar também `Carro › Gasolina` e
 * `Carro › Seguro`. Sem isto, filtrar por uma categoria do meio da árvore
 * devolveria só os gastos lançados exatamente nela — quase sempre nenhum, porque
 * quem registra escolhe a folha.
 *
 * O espelho disto no banco é `category_subtree()`, usada pela regra de exclusão.
 * As duas existem porque respondem em lugares diferentes: lá, para decidir se uma
 * categoria pode ser excluída; aqui, para montar o filtro da lista sem uma ida ao
 * servidor a cada troca do seletor.
 *
 * Uma categoria que não está na lista devolve só o próprio id: é o resultado
 * honesto (nenhum descendente conhecido) e mantém o filtro funcionando.
 */
export function idsDaSubarvore(categorias: Categoria[], id: number): number[] {
  const filhasPorMae = new Map<number, number[]>()
  for (const categoria of categorias) {
    if (categoria.paiId === null) continue
    const irmas = filhasPorMae.get(categoria.paiId)
    if (irmas) irmas.push(categoria.id)
    else filhasPorMae.set(categoria.paiId, [categoria.id])
  }

  const ids: number[] = []
  const aVisitar = [id]
  // O teto é a rede contra um ciclo nos dados: o banco impede que um se forme,
  // mas uma travessia por ponteiros não deve depender disso para terminar —
  // travaria a aba inteira.
  while (aVisitar.length > 0 && ids.length <= categorias.length) {
    const atual = aVisitar.pop() as number
    if (ids.includes(atual)) continue
    ids.push(atual)
    aVisitar.push(...(filhasPorMae.get(atual) ?? []))
  }

  return ids
}

/**
 * A árvore de volta em lista, mas **na ordem em que se lê** — mãe, depois as
 * filhas dela, depois as netas — com a profundidade de cada uma.
 *
 * É o formato de que um `<select>` precisa: HTML não aninha opções em mais de um
 * nível, então a hierarquia é comunicada pelo recuo. A ordem de leitura é o que
 * mantém `Gasolina` logo abaixo de `Carro` na lista suspensa, em vez de perdida
 * no meio das categorias de topo.
 *
 * Só as **ativas**: uma categoria desativada saiu da árvore de propósito, e
 * oferecê-la num seletor de gasto novo a traria de volta pela porta dos fundos.
 */
export function achatarArvore(categorias: Categoria[]): { categoria: Categoria; nivel: number }[] {
  const achatadas: { categoria: Categoria; nivel: number }[] = []

  function descer(nos: NoDeCategoria[], nivel: number) {
    for (const no of nos) {
      achatadas.push({ categoria: no, nivel })
      descer(no.filhas, nivel + 1)
    }
  }

  descer(separarPorEstado(categorias).ativas, 0)
  return achatadas
}

import type { Categoria, NoDeCategoria } from '@/shared/data/model'

/**
 * A forma de árvore das categorias — o passo entre o que o banco devolve e o
 * que a tela desenha.
 *
 * Fica fora do `supabase.ts` porque não é uma consulta: são funções puras, sem
 * rede e sem estado. O banco manda uma **lista plana** (que é o formato certo
 * para trafegar: sem repetição e sem aninhamento a serializar) e aqui ela vira
 * a árvore que os componentes percorrem.
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

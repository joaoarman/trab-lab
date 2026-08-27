import type { Categoria, NoDeCategoria } from '@/shared/data/model'

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

export function caminhoAte(categorias: Categoria[], id: number): Categoria[] {
  const porId = new Map(categorias.map((categoria) => [categoria.id, categoria]))

  const caminho: Categoria[] = []
  let atual = porId.get(id)
  // O teto corta um ciclo mãe/filha, que o banco impede mas um cache velho não.
  while (atual && caminho.length <= porId.size) {
    caminho.unshift(atual)
    atual = atual.paiId === null ? undefined : porId.get(atual.paiId)
  }

  return caminho
}

export function tamanhoDaSubarvore(no: NoDeCategoria): number {
  return 1 + no.filhas.reduce((total, filha) => total + tamanhoDaSubarvore(filha), 0)
}

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
  // O teto corta um ciclo mãe/filha, que o banco impede mas um cache velho não.
  while (aVisitar.length > 0 && ids.length <= categorias.length) {
    const atual = aVisitar.pop() as number
    if (ids.includes(atual)) continue
    ids.push(atual)
    aVisitar.push(...(filhasPorMae.get(atual) ?? []))
  }

  return ids
}

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

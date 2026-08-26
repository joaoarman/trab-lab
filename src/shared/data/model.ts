// =============================================================================
// Modelo de domínio do sistema (vocabulário do app, em camelCase).
// As funções de dados (supabase.ts de cada módulo) RETORNAM estes tipos —
// nunca o objeto cru do Supabase. É a "costura" para uma futura troca de API.
//
// Mocks/dados de exemplo (temporários) também ficam em src/shared/data/
// (ex.: seed.ts), e devem ser removidos ao entrar as chamadas reais do Supabase.
// =============================================================================

/**
 * O perfil do usuário logado — a linha de `public.profile` traduzida.
 *
 * `id` é o inteiro do perfil: é ele que as tabelas de gasto, receita, categoria,
 * chat e log da IA vão referenciar. `authUuid` é a ligação com o Supabase Auth,
 * e serve ao front para uma coisa só: montar o caminho da foto no bucket
 * (`<authUuid>/avatar.jpg`).
 */
export interface Perfil {
  id: number
  authUuid: string
  nome: string
  /**
   * Espelho de `auth.users.email`. Somente leitura pelo app — trocar o e-mail é
   * um fluxo do Supabase Auth (ver `src/pages/Account/supabase.ts`), nunca um
   * update nesta coluna.
   */
  email: string
  /**
   * CAMINHO do objeto no bucket `avatars` (ex.: `<authUuid>/avatar.jpg`), ou
   * null. Não é uma URL: quem monta a URL pública é `urlDoAvatar()`, no
   * `supabase.ts` do módulo Account. Guardar a URL pronta assaria o endereço do
   * projeto Supabase dentro dos dados.
   */
  avatarPath: string | null
  /** Preenchido = conta desativada. O app derruba a sessão quando encontra. */
  desativadoEm: string | null
  /** Última gravação do perfil — usada como "versão" da foto (cache busting). */
  atualizadoEm: string
}

/**
 * Uma categoria da hierarquia — a linha de `public.category` traduzida.
 *
 * A árvore é auto-relacionada: `paiId` aponta para a categoria mãe, e `null`
 * significa categoria de topo. A profundidade é livre (`Carro › Gasolina`,
 * `Casa › Mercado › Feira`).
 *
 * A **forma de árvore** é montada no front, em `pages/Categorias/arvore.ts`: o
 * banco devolve a lista plana, que é o formato certo para trafegar.
 */
export interface Categoria {
  id: number
  /** Categoria mãe. `null` = categoria de topo. */
  paiId: number | null
  nome: string
  /**
   * A etiqueta de cor escolhida pelo usuário, em hexadecimal (`#10b981`).
   *
   * É **dado**, não identidade visual: a paleta, as fontes e o raio do app
   * continuam vindo do `src/theme.css`. O que se guarda aqui é a escolha da
   * pessoa de pintar "Carro" de verde — por isso vai num `style`, e não numa
   * classe do Tailwind.
   */
  cor: string
  /**
   * Ativa. `false` = desativada: sai da árvore principal e vai para o submenu
   * "Desativadas", de onde pode voltar. Uma categoria desativada arrasta a
   * subárvore inteira junto — o banco garante esse invariante.
   */
  ativa: boolean
  criadaEm: string
}

/** Uma categoria já com as filhas penduradas — o formato que a tela desenha. */
export interface NoDeCategoria extends Categoria {
  filhas: NoDeCategoria[]
}

/**
 * O que **aconteceria** ao excluir uma categoria — a prévia que a modal de
 * confirmação usa para dizer a verdade em vez de um texto genérico.
 *
 * É só uma prévia: quem decide de fato é o banco, no momento de agir
 * (`excluirCategoria` devolve o que realmente aconteceu).
 */
export interface ImpactoDeExclusao {
  /** Quantas subcategorias vão junto (a própria categoria não conta). */
  descendentes: number
  /** Quantos lançamentos (gastos/receitas) apontam para a subárvore. */
  registros: number
  /** `'excluir'` só quando não há nada vinculado; senão, `'desativar'`. */
  acao: AcaoDeRemocao
}

/** O destino de uma categoria ao ser removida. */
export type AcaoDeRemocao = 'excluir' | 'desativar'

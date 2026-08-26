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

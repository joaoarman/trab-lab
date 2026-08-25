// =============================================================================
// Modelo de domínio do sistema (vocabulário do app, em camelCase).
// As funções de dados (supabase.ts de cada módulo) RETORNAM estes tipos —
// nunca o objeto cru do Supabase. É a "costura" para uma futura troca de API.
//
// Mocks/dados de exemplo (temporários) também ficam em src/shared/data/
// (ex.: seed.ts), e devem ser removidos ao entrar as chamadas reais do Supabase.
//
// Exemplo:
//   export type ExemploStatus = 'rascunho' | 'concluido'
//   export interface Exemplo {
//     id: string
//     nome: string
//     status: ExemploStatus
//     createdAt: string
//   }
// =============================================================================
export {}

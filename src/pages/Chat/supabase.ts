// =============================================================================
// Camada de dados do módulo Chat.
//
// TODAS as queries do módulo vivem aqui — nenhuma tela chama o cliente Supabase
// direto. As funções RETORNAM tipos de domínio (src/shared/data/model.ts), nunca
// o objeto cru do Supabase: é a "costura" que permite trocar a API por baixo sem
// mexer em componente.
//
// Convenções:
//  • o banco fala snake_case, o app fala camelCase — a conversão acontece aqui,
//    numa função `para<Tipo>()` por entidade;
//  • nada de `select('*')`: liste as colunas, para o dia em que a tabela ganhar
//    uma coluna pesada ou sensível;
//  • o filtro por dono NÃO é escrito na query — quem garante isso é a RLS
//    (`auth.uid()`), no banco. Ver o modelo de acesso do projeto.
//
// O schema deste módulo vive em supabase/migrations/ e supabase/schema/.
// =============================================================================
export {}

-- =========================================================================
-- indexes.sql
-- Índices. Estado ATUAL do banco para esta entidade.
-- =========================================================================

-- --- public.category -----------------------------------------------------

-- A leitura da tela: "todas as categorias vivas deste perfil".
create index if not exists category_profile_idx
  on public.category (profile_id)
  where deleted_at is null;

-- A subida e a descida da árvore (o WITH RECURSIVE de category_subtree e a FK).
create index if not exists category_parent_idx
  on public.category (parent_id)
  where deleted_at is null;

-- Duas irmãs não podem ter o mesmo nome (ignorando maiúsculas).
--
-- Não é preciosismo: o Chat vai CRIAR CATEGORIA SOZINHO ("gastei 20 no posto" →
-- Carro › Gasolina), e esse "achar ou criar" precisa de uma resposta única para
-- "existe uma Gasolina dentro de Carro?". Com duas irmãs homônimas, metade dos
-- gastos vai para uma e metade para a outra, e o total do mês passa a mentir.
--
-- `coalesce(parent_id, 0)` porque, em índice único, NULL nunca colide com NULL:
-- sem ele, nada impediria duas categorias de topo chamadas "Casa".
--
-- Só as linhas vivas: uma categoria EXCLUÍDA libera o nome; uma DESATIVADA não —
-- ela ainda está no submenu, e o caminho certo é reativá-la.
create unique index if not exists category_sibling_name_uk
  on public.category (profile_id, coalesce(parent_id, 0), lower(name))
  where deleted_at is null;

-- --- public.expense ------------------------------------------------------

-- A leitura da tela e a do Chat: "os gastos deste perfil, neste período, do mais
-- recente para o mais antigo". As colunas na ordem em que a query as usa —
-- filtra por perfil, recorta o período, já entrega ordenado.
create index if not exists expense_profile_occurred_idx
  on public.expense (profile_id, occurred_at desc)
  where deleted_at is null;

-- O filtro por categoria da tela E a contagem de category_linked_records (que
-- decide se uma categoria pode ser excluída) — as duas percorrem por category_id.
create index if not exists expense_category_idx
  on public.expense (category_id)
  where deleted_at is null;

-- --- public.income -------------------------------------------------------

-- A leitura da tela e a do Chat: "as receitas deste perfil, neste período, da
-- mais recente para a mais antiga". As colunas na ordem em que a query as usa.
--
-- É o ÚNICO índice do módulo, e a ausência do segundo é a diferença de Gastos:
-- lá existe `expense_category_idx` porque a tela filtra por categoria e porque
-- `category_linked_records` conta por categoria. Receita não tem categoria.
create index if not exists income_profile_received_idx
  on public.income (profile_id, received_at desc)
  where deleted_at is null;

-- --- public.ai_log -------------------------------------------------------


-- A leitura do módulo LOG DA IA: "tudo deste perfil, do mais recente para o mais
-- antigo, dentro de um período". As colunas na ordem em que a query as usa.
create index if not exists ai_log_profile_created_idx
  on public.ai_log (profile_id, created_at desc, id desc);

-- A leitura do módulo CHAT: só a conversa viva, paginada por id.
--
-- Paginar por **id**, e não por data, porque a pergunta e a resposta de um turno
-- nascem no mesmo `now()` — uma paginação por `created_at` poderia repetir ou
-- pular uma das duas na virada da página.
--
-- Índice PARCIAL: a conversa limpa não é lida pelo Chat nunca, e mantê-la fora do
-- índice é o que faz "limpar" também aliviar a leitura mais quente do sistema.
create index if not exists ai_log_chat_idx
  on public.ai_log (profile_id, id desc)
  where is_active;

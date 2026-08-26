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

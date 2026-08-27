-- =========================================================================
-- policies.sql
-- RLS + policies (escopo de acesso por projeto).
-- Estado ATUAL do banco para esta entidade.
--
-- TENANCY: B2C por usuário — cada pessoa só enxerga e altera
-- os PRÓPRIOS dados. O front-end NÃO escreve o filtro por dono nas queries;
-- quem garante é a RLS daqui.
--
-- Padrão para as tabelas dos próximos módulos (gasto, receita, categoria,
-- mensagem do chat, log da IA):
--     using      (profile_id = public.current_profile_id())
--     with check (profile_id = public.current_profile_id())
-- A própria `profile` é a exceção: compara `auth.uid() = auth_uuid` direto,
-- porque usar current_profile_id() ali seria uma policy da tabela consultando a
-- própria tabela — recursão de RLS.
-- =========================================================================

alter table public.profile enable row level security;

-- Sem policy de INSERT: quem cria o perfil é o trigger handle_new_user.
-- Sem policy de DELETE: não se apaga a linha — a saída é o soft-delete.
drop policy if exists profile_select_own on public.profile;
create policy profile_select_own on public.profile
  for select to authenticated
  using (auth.uid() = auth_uuid);

drop policy if exists profile_update_own on public.profile;
create policy profile_update_own on public.profile
  for update to authenticated
  using (auth.uid() = auth_uuid)
  with check (auth.uid() = auth_uuid);

-- --- public.category -----------------------------------------------------
alter table public.category enable row level security;

-- `deleted_at is null` entra nas policies, e não só nas queries do front: assim
-- "excluída sumiu" é uma garantia do BANCO, não uma convenção que alguém pode
-- esquecer de repetir na próxima tela (ou no Chat, ou no Log da IA).
drop policy if exists category_select_own on public.category;
create policy category_select_own on public.category
  for select to authenticated
  using (profile_id = public.current_profile_id() and deleted_at is null);

drop policy if exists category_insert_own on public.category;
create policy category_insert_own on public.category
  for insert to authenticated
  with check (profile_id = public.current_profile_id());

drop policy if exists category_update_own on public.category;
create policy category_update_own on public.category
  for update to authenticated
  using (profile_id = public.current_profile_id() and deleted_at is null)
  with check (profile_id = public.current_profile_id());

-- Sem policy de DELETE, de propósito: a saída é o soft-delete de
-- `category_remove()`. Um DELETE de verdade cascatearia a subárvore inteira pela
-- FK e, no futuro, levaria junto o histórico que apontasse para ela.

-- --- public.expense ------------------------------------------------------
alter table public.expense enable row level security;

-- `deleted_at is null` nas policies, e não só nas queries do front: "excluído
-- sumiu" é garantia do BANCO, não convenção que a próxima tela pode esquecer.
drop policy if exists expense_select_own on public.expense;
create policy expense_select_own on public.expense
  for select to authenticated
  using (profile_id = public.current_profile_id() and deleted_at is null);

drop policy if exists expense_insert_own on public.expense;
create policy expense_insert_own on public.expense
  for insert to authenticated
  with check (profile_id = public.current_profile_id());

drop policy if exists expense_update_own on public.expense;
create policy expense_update_own on public.expense
  for update to authenticated
  using (profile_id = public.current_profile_id() and deleted_at is null)
  with check (profile_id = public.current_profile_id());

-- Sem policy de DELETE, de propósito: a saída é o soft-delete de
-- `expense_remove()`. Um DELETE de verdade levaria o histórico embora, e um
-- extrato que perde linhas para sempre não fecha com o mês anterior.

-- --- public.income -------------------------------------------------------
alter table public.income enable row level security;

-- `deleted_at is null` nas policies, e não só nas queries do front: "excluída
-- sumiu" é garantia do BANCO, não convenção que a próxima tela pode esquecer.
drop policy if exists income_select_own on public.income;
create policy income_select_own on public.income
  for select to authenticated
  using (profile_id = public.current_profile_id() and deleted_at is null);

drop policy if exists income_insert_own on public.income;
create policy income_insert_own on public.income
  for insert to authenticated
  with check (profile_id = public.current_profile_id());

drop policy if exists income_update_own on public.income;
create policy income_update_own on public.income
  for update to authenticated
  using (profile_id = public.current_profile_id() and deleted_at is null)
  with check (profile_id = public.current_profile_id());

-- Sem policy de DELETE, de propósito: a saída é o soft-delete de
-- `income_remove()`. Um DELETE de verdade levaria o histórico embora, e um
-- extrato que perde linhas para sempre não fecha com o mês anterior.

-- --- public.ai_log -------------------------------------------------------

alter table public.ai_log enable row level security;

-- SELECT e nada mais. Não há policy de insert, de update nem de delete, e a
-- ausência é o desenho:
--   • inserir é `ai_log_add_turn` (security definer). Com policy de insert, um
--     cliente poderia forjar uma resposta da IA — inclusive um "✅ gasto salvo"
--     que nunca aconteceu;
--   • atualizar é `chat_clear` (idem). Com policy de update, o mesmo caminho que
--     limpa a conversa reescreveria o custo já contabilizado;
--   • apagar não existe. Ver o comentário da tabela.
drop policy if exists ai_log_select_own on public.ai_log;
create policy ai_log_select_own on public.ai_log
  for select to authenticated
  using (profile_id = public.current_profile_id());

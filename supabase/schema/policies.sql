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

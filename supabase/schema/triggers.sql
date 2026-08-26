-- =========================================================================
-- triggers.sql
-- Triggers.
-- Estado ATUAL do banco para esta entidade.
-- =========================================================================

-- --- auth.users ----------------------------------------------------------

-- Caminho real deste projeto: com a confirmação de e-mail DESLIGADA, a conta já
-- nasce confirmada no próprio INSERT.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rede para o dia em que a confirmação for LIGADA (aí o perfil só deve nascer
-- depois que a pessoa confirmar).
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_new_user();

-- Espelho do e-mail em profile.email.
drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_update();

-- --- public.profile ------------------------------------------------------

-- Colunas somente-leitura para o cliente + updated_at automático.
drop trigger if exists on_profile_before_update on public.profile;
create trigger on_profile_before_update
  before update on public.profile
  for each row execute function public.profile_guard_and_touch();

-- --- public.category ------------------------------------------------------

-- Normaliza nome/cor, aplica "excluída é sempre inativa" e recusa ciclo na árvore.
drop trigger if exists on_category_before_write on public.category;
create trigger on_category_before_write
  before insert or update on public.category
  for each row execute function public.category_guard();

-- --- public.expense -------------------------------------------------------

-- Normaliza o nome, aplica "excluído é sempre inativo", confere a categoria e —
-- o principal — CALCULA o valor em reais a partir do valor e da cotação.
drop trigger if exists on_expense_before_write on public.expense;
create trigger on_expense_before_write
  before insert or update on public.expense
  for each row execute function public.expense_guard();

-- --- public.income --------------------------------------------------------

-- Normaliza o nome, aplica "excluída é sempre inativa" e — o principal —
-- CALCULA o valor em reais a partir do valor e da cotação.
drop trigger if exists on_income_before_write on public.income;
create trigger on_income_before_write
  before insert or update on public.income
  for each row execute function public.income_guard();

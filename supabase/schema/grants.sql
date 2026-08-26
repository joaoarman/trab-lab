-- =========================================================================
-- grants.sql
-- Grants por role (anon, authenticated, service_role) — menor privilégio.
-- Estado ATUAL do banco para esta entidade.
--
-- RLS e GRANT respondem a perguntas diferentes: a RLS diz QUAIS LINHAS, o grant
-- de coluna diz QUAIS COLUNAS. Sem o segundo, o dono da própria linha poderia
-- reescrever o e-mail espelhado ou "reviver" a conta zerando deleted_at.
-- =========================================================================

-- --- public.profile ------------------------------------------------------
revoke all on public.profile from anon, authenticated;
grant select on public.profile to authenticated;
grant update (full_name, avatar_path) on public.profile to authenticated;

-- --- functions -----------------------------------------------------------
-- Funções de trigger: ninguém chama à mão.
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.handle_user_email_update() from public, anon, authenticated;
revoke execute on function public.profile_guard_and_touch()  from public, anon, authenticated;

-- Funções da conta: só quem está logado.
revoke execute on function public.current_profile_id()       from public, anon;
grant  execute on function public.current_profile_id()       to authenticated;

revoke execute on function public.ensure_profile()           from public, anon;
grant  execute on function public.ensure_profile()           to authenticated;

-- NÃO exposta a `anon` de propósito: seria um endereço público para descobrir
-- quem tem conta no sistema, e sem CAPTCHA nada impediria raspar isso em lista.
revoke execute on function public.email_available(text)      from public, anon;
grant  execute on function public.email_available(text)      to authenticated;

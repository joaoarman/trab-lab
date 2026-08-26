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

-- --- public.category -----------------------------------------------------
-- A RLS diz QUAIS LINHAS; o grant de coluna diz QUAIS COLUNAS. Aqui é o segundo
-- que importa: sem ele, o dono da própria linha poderia mandar
-- `is_active = true` ou `deleted_at = null` direto pela API REST e desfazer
-- qualquer regra das RPCs acima — inclusive reativar uma filha sozinha e deixar
-- a árvore incoerente. Com o grant recortado, `is_active` e `deleted_at` só
-- mudam por `category_remove` / `category_reactivate`, que são `security
-- definer` e rodam como dono da tabela.
--
-- `profile_id` também fica de fora: quem o preenche é o DEFAULT.
revoke all on public.category from anon, authenticated;
grant select                            on public.category to authenticated;
grant insert (name, color, parent_id)   on public.category to authenticated;
grant update (name, color, parent_id)   on public.category to authenticated;

-- Função de trigger: ninguém chama à mão.
revoke execute on function public.category_guard() from public, anon, authenticated;

-- Internas das RPCs. Não são expostas: category_impact/remove/reactivate são
-- `security definer` e as chamam como DONAS — o cliente não precisa de execute aqui.
revoke execute on function public.category_subtree(int)              from public, anon, authenticated;
revoke execute on function public.category_linked_records(int[])     from public, anon, authenticated;
revoke execute on function public.category_action_for(int, int)      from public, anon, authenticated;

-- O que a tela chama: só quem está logado.
revoke execute on function public.category_impact(int)     from public, anon;
grant  execute on function public.category_impact(int)     to authenticated;

revoke execute on function public.category_remove(int)     from public, anon;
grant  execute on function public.category_remove(int)     to authenticated;

revoke execute on function public.category_reactivate(int) from public, anon;

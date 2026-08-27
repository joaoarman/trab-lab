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
grant  execute on function public.category_reactivate(int) to authenticated;

-- --- public.expense ------------------------------------------------------
-- Dois recortes, por dois motivos distintos:
--   • `amount_brl` fora do grant torna a conversão da trigger INESCAPÁVEL.
--     Com grant, o cliente mandaria "US$ 50, cotação 5,16, R$ 10,00" pela API
--     REST e o total do mês mentiria, sem nenhuma linha estranha à vista.
--   • `is_active` e `deleted_at` fora do grant fazem de `expense_remove()` a
--     única saída — com grant, dava para desfazer uma exclusão zerando a coluna.
-- `profile_id` também fica de fora: quem o preenche é o DEFAULT.
revoke all on public.expense from anon, authenticated;
grant select on public.expense to authenticated;
grant insert (name, amount, currency, exchange_rate, category_id, occurred_at)
      on public.expense to authenticated;
grant update (name, amount, currency, exchange_rate, category_id, occurred_at)
      on public.expense to authenticated;

-- Função de trigger: ninguém chama à mão.
revoke execute on function public.expense_guard() from public, anon, authenticated;

-- O que a tela chama: só quem está logado.
revoke execute on function public.expense_remove(int) from public, anon;
grant  execute on function public.expense_remove(int) to authenticated;

-- --- public.income -------------------------------------------------------
-- Os mesmos dois recortes de `expense` — `amount_brl` fora do grant torna a
-- conversão da trigger inescapável; `is_active`/`deleted_at` fora dele fazem de
-- `income_remove()` a única saída — mais um terceiro, próprio deste módulo:
--
--   • `created_at` fora do grant. A tela de Receitas EXIBE "registrada em". Com
--     grant de escrita, o cliente poderia antedatar o próprio registro, e a
--     coluna que existe para dizer quando a linha entrou no sistema deixaria de
--     servir para isso.
--
-- `profile_id` também fica de fora: quem o preenche é o DEFAULT.
revoke all on public.income from anon, authenticated;
grant select on public.income to authenticated;
grant insert (name, amount, currency, exchange_rate, received_at)
      on public.income to authenticated;
grant update (name, amount, currency, exchange_rate, received_at)
      on public.income to authenticated;

-- Função de trigger: ninguém chama à mão.
revoke execute on function public.income_guard() from public, anon, authenticated;

-- O que a tela chama: só quem está logado.
revoke execute on function public.income_remove(int) from public, anon;
grant  execute on function public.income_remove(int) to authenticated;


-- --- public.ai_log --------------------------------------------------------
-- SELECT e MAIS NADA. Sem insert (senão um cliente forjaria uma resposta da IA —
-- inclusive um "✅ gasto salvo" que nunca aconteceu), sem update (senão o mesmo
-- caminho que limpa a conversa reescreveria o custo já contabilizado) e sem
-- delete (a auditoria não se apaga). Escrever é pelas duas RPCs abaixo.
revoke all    on public.ai_log from anon, authenticated;
grant  select on public.ai_log to   authenticated;

revoke execute on function public.ai_log_add_turn(text, text, text, numeric, text, int, int, text, jsonb, jsonb, numeric, text, int, int, int) from public, anon;
grant  execute on function public.ai_log_add_turn(text, text, text, numeric, text, int, int, text, jsonb, jsonb, numeric, text, int, int, int) to   authenticated;

revoke execute on function public.chat_clear() from public, anon;
grant  execute on function public.chat_clear() to   authenticated;

-- --- o achar-ou-criar de categoria ---------------------------------------
-- Exposta a `authenticated` porque quem a chama é a Edge Function `chat`, e ela
-- roda com o JWT do usuário — não com service_role. O escopo por dono continua
-- sendo do banco: a função resolve o perfil por current_profile_id().
revoke execute on function public.category_resolve_path(text[], text) from public, anon;
grant  execute on function public.category_resolve_path(text[], text) to   authenticated;

-- --- as agregações --------------------------------------------------------
revoke execute on function public.expense_report(timestamptz, timestamptz, int[], boolean, text) from public, anon;
grant  execute on function public.expense_report(timestamptz, timestamptz, int[], boolean, text) to   authenticated;

revoke execute on function public.expense_by_category(timestamptz, timestamptz) from public, anon;
grant  execute on function public.expense_by_category(timestamptz, timestamptz) to   authenticated;

revoke execute on function public.income_report(timestamptz, timestamptz, text) from public, anon;
grant  execute on function public.income_report(timestamptz, timestamptz, text) to   authenticated;

revoke execute on function public.ai_log_report(timestamptz, timestamptz) from public, anon;
grant  execute on function public.ai_log_report(timestamptz, timestamptz) to   authenticated;

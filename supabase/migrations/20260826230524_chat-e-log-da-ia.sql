-- 20260826230524_chat-e-log-da-ia.sql
--
-- Chat e Log da IA, numa tabela só (`ai_log`): a conversa E a auditoria, mais
-- `ai_log_add_turn`, `chat_clear`, `category_resolve_path` e as agregações.
-- O Chat e o Log da IA são recortes da MESMA tabela, por isso ela é uma só.
--
-- Copiar e colar no SQL Editor do Supabase.

-- 1. public.ai_log — a conversa E a auditoria, numa tabela só
create table if not exists public.ai_log (
  id         int generated always as identity primary key,

  profile_id int not null references public.profile (id) on delete cascade,

  role       text not null constraint ai_log_role_valid
               check (role in ('USER', 'ASSISTANT')),

  content    text not null constraint ai_log_content_length
               check (char_length(content) between 1 and 8000),

  source     text not null default 'TEXT' constraint ai_log_source_valid
               check (source in ('TEXT', 'AUDIO')),

  kind       text not null default 'MESSAGE' constraint ai_log_kind_valid
               check (kind in ('MESSAGE', 'REFUSAL')),

  receipts   jsonb constraint ai_log_receipts_is_array
               check (receipts is null or jsonb_typeof(receipts) = 'array'),

  tool_calls jsonb constraint ai_log_tool_calls_is_array
               check (tool_calls is null or jsonb_typeof(tool_calls) = 'array'),

  ai_model   text,

  tokens_input        int,
  tokens_input_cached int,
  tokens_output       int,

  cost_usd_cents numeric(12, 6),

  is_active  boolean not null default true,

  created_at timestamptz not null default now(),

  constraint ai_log_audio_is_user check (source = 'TEXT' or role = 'USER'),

  constraint ai_log_refusal_is_assistant check (kind = 'MESSAGE' or role = 'ASSISTANT'),

  constraint ai_log_payload_is_assistant check (
    role = 'ASSISTANT' or (receipts is null and tool_calls is null)
  ),
  constraint ai_log_cost_positive check (cost_usd_cents is null or cost_usd_cents >= 0),

  constraint ai_log_tokens_valid check (
        (tokens_input        is null or tokens_input        >= 0)
    and (tokens_input_cached is null or tokens_input_cached >= 0)
    and (tokens_output       is null or tokens_output       >= 0)
    and (tokens_input_cached is null or tokens_input is null or tokens_input_cached <= tokens_input)
  )
);

comment on table public.ai_log is
  'A conversa com a IA E a auditoria dela, numa tabela só: uma linha por mensagem (USER e ASSISTANT). O módulo Chat lê o recorte is_active; o módulo Log da IA lê tudo, inclusive o que foi limpo da conversa. Nada aqui é apagado — não há grant nem policy de delete, e limpar é is_active = false.';

comment on column public.ai_log.profile_id is
  'Dono. Sem DEFAULT current_profile_id(), ao contrário das outras tabelas: esta não é escrita pelo cliente em hipótese nenhuma — quem escreve é ai_log_add_turn.';
comment on column public.ai_log.role is
  'Quem falou: USER ou ASSISTANT. Inglês MAIÚSCULO — constante do sistema, não texto de tela.';
comment on column public.ai_log.content is
  'O texto da bolha. Já transcrito, quando veio de áudio.';
comment on column public.ai_log.source is
  'Como a mensagem entrou: TEXT (digitada) ou AUDIO (ditada e transcrita). Só se aplica a USER.';
comment on column public.ai_log.kind is
  'MESSAGE = resposta normal. REFUSAL = o assunto estava fora do sistema, e a tela desenha em vermelho. É coluna, e não dedução do texto: quem carimba é a Edge Function, pelo fato de a ferramenta de recusa ter rodado — a tela não vai procurar uma frase dentro do que um modelo escreveu.';
comment on column public.ai_log.receipts is
  'Os cartões de confirmação da resposta — um por registro criado, editado ou excluído no turno. É um RECIBO: o retrato do registro no instante em que foi salvo, e por isso JSON e não FK. Uma FK apontaria para a linha viva, e a bolha de três semanas atrás passaria a exibir o valor de hoje (ou a sumir, se o registro fosse excluído).';
comment on column public.ai_log.tool_calls is
  'As ferramentas que rodaram no turno, com argumentos e desfecho. É o que responde "o que a IA fez com a minha mensagem?" na tela do Log — sem isto, o log diria quanto custou sem dizer o que foi feito.';
comment on column public.ai_log.ai_model is
  'O modelo que produziu esta mensagem: o de conversa na resposta do assistente, o de transcrição na mensagem ditada. NULL em mensagem digitada. Gravado por linha, e não deduzido da constante atual, porque a constante muda: sem isto, trocar de modelo reescreveria o passado.';
comment on column public.ai_log.tokens_input is
  'Tokens de ENTRADA cobrados. Na resposta do assistente, a soma de todas as rodadas de ferramenta. Na transcrição, áudio + texto juntos. NULL quando a API não informou.';
comment on column public.ai_log.tokens_input_cached is
  'Quanto da ENTRADA veio do cache de prompt da OpenAI, pela metade do preço. Está DENTRO de tokens_input, não é um extra a somar. Só a conversa tem cache.';
comment on column public.ai_log.tokens_output is
  'Tokens de SAÍDA cobrados.';
comment on column public.ai_log.cost_usd_cents is
  'Quanto esta mensagem custou de IA, em CENTAVOS de dólar, fracionário (uma chamada custa menos de um centavo). numeric e nunca float: existe para ser somado. NULL em mensagem digitada — não houve chamada, e null não é zero.';
comment on column public.ai_log.is_active is
  'False = o usuário limpou a conversa. Some da tela do Chat e do contexto da IA, mas continua no banco e na tela do Log — limpar a conversa não leva embora a auditoria nem o custo já pago.';


-- 2. Índices
create index if not exists ai_log_profile_created_idx
  on public.ai_log (profile_id, created_at desc, id desc);

create index if not exists ai_log_chat_idx
  on public.ai_log (profile_id, id desc)
  where is_active;


-- 3. RLS + policies
alter table public.ai_log enable row level security;

drop policy if exists ai_log_select_own on public.ai_log;
create policy ai_log_select_own on public.ai_log
  for select to authenticated
  using (profile_id = public.current_profile_id());


-- 4. ai_log_add_turn — grava o turno inteiro, ou nada
create or replace function public.ai_log_add_turn(
  p_user_content      text,
  p_assistant_content text,
  p_user_source       text default 'TEXT',

  p_user_cost_usd_cents numeric default null,
  p_user_model          text    default null,
  p_user_tokens_input   int     default null,
  p_user_tokens_output  int     default null,

  p_assistant_kind            text    default 'MESSAGE',
  p_assistant_receipts        jsonb   default null,
  p_assistant_tool_calls      jsonb   default null,
  p_assistant_cost_usd_cents  numeric default null,
  p_assistant_model           text    default null,

  p_assistant_tokens_input    int     default null,
  p_assistant_tokens_cached   int     default null,
  p_assistant_tokens_output   int     default null
)
returns setof public.ai_log
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id int;
begin
  v_profile_id := public.current_profile_id();

  if v_profile_id is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  if p_user_source not in ('TEXT', 'AUDIO') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;

  if p_assistant_kind not in ('MESSAGE', 'REFUSAL') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_user_content), '') = ''
     or coalesce(btrim(p_assistant_content), '') = '' then
    raise exception 'empty_message' using errcode = 'P0001';
  end if;

  if p_user_source = 'TEXT' then
    p_user_cost_usd_cents := null;
    p_user_model          := null;
    p_user_tokens_input   := null;
    p_user_tokens_output  := null;
  end if;

  return query
  insert into public.ai_log (
    profile_id, role, content, source, kind,
    receipts, tool_calls,
    cost_usd_cents, ai_model, tokens_input, tokens_input_cached, tokens_output
  )
  values
    (v_profile_id, 'USER', btrim(p_user_content), p_user_source, 'MESSAGE',
     null, null,
     p_user_cost_usd_cents, p_user_model, p_user_tokens_input, null, p_user_tokens_output),
    (v_profile_id, 'ASSISTANT', btrim(p_assistant_content), 'TEXT', p_assistant_kind,
     p_assistant_receipts, p_assistant_tool_calls,
     p_assistant_cost_usd_cents, p_assistant_model,
     p_assistant_tokens_input, p_assistant_tokens_cached, p_assistant_tokens_output)
  returning *;
end;
$$;

comment on function public.ai_log_add_turn(text, text, text, numeric, text, int, int, text, jsonb, jsonb, numeric, text, int, int, int) is
  'Grava o turno da conversa (pergunta + resposta) numa transação só e devolve as duas linhas. Única forma de inserir em public.ai_log — não há grant nem policy de INSERT, o que impede um cliente de forjar uma resposta da IA. Mensagem digitada tem custo, modelo e tokens zerados para null aqui dentro. Chamada pela Edge Function `chat` com o JWT do usuário, nunca com service_role.';


-- 5. chat_clear — o "limpar conversa"
create or replace function public.chat_clear()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id int := public.current_profile_id();
  v_count      int;
begin
  if v_profile_id is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  update public.ai_log
     set is_active = false
   where profile_id = v_profile_id
     and is_active;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.chat_clear() is
  'Limpa a conversa do Chat: is_active = false nas mensagens do perfil, nunca delete. Elas somem da tela e do contexto da IA, mas continuam no banco e na tela do Log da IA — limpar não leva embora a auditoria nem o custo já pago. Devolve quantas saíram.';


-- 6. category_resolve_path — o achar-ou-criar de `Carro › Gasolina`
create or replace function public.category_resolve_path(
  p_path  text[],

  p_color text default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id int := public.current_profile_id();
  v_parent_id  int := null;
  v_id         int;
  v_nome       text;
  v_ativa      boolean;
  v_reativar   boolean := false;
  i            int;
begin
  if v_profile_id is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  if p_path is null or array_length(p_path, 1) is null then
    raise exception 'category_path_empty' using errcode = 'P0001';
  end if;

  if array_length(p_path, 1) > 5 then
    raise exception 'category_path_too_deep' using errcode = 'P0001';
  end if;

  for i in 1 .. array_length(p_path, 1) loop
    v_nome := btrim(p_path[i]);

    if v_nome = '' or char_length(v_nome) > 60 then
      raise exception 'category_name_invalid' using errcode = 'P0001';
    end if;

    select c.id, c.is_active
      into v_id, v_ativa
      from public.category c
     where c.profile_id = v_profile_id
       and c.deleted_at is null
       and coalesce(c.parent_id, 0) = coalesce(v_parent_id, 0)
       and lower(btrim(c.name)) = lower(v_nome)
     limit 1;

    if v_id is null then
      insert into public.category (profile_id, parent_id, name, color)
      values (v_profile_id, v_parent_id, v_nome, coalesce(p_color, '#10b981'))
      returning id into v_id;
    elsif not v_ativa then
      v_reativar := true;
    end if;

    v_parent_id := v_id;
    v_id := null;
  end loop;

  if v_reativar then
    perform public.category_reactivate(v_parent_id);
  end if;

  return v_parent_id;
end;
$$;

comment on function public.category_resolve_path(text[], text) is
  'Acha ou cria o caminho de categorias ({Carro,Gasolina}) e devolve o id da FOLHA. É o que permite ao Chat classificar um gasto sem o usuário ter montado a árvore antes. Compara por lower(btrim(name)) — a mesma regra do índice category_sibling_name_uk, senão "gasolina" não acharia "Gasolina" e o insert bateria no unique. Categoria desativada é reaproveitada e reativada (com a cadeia de mães), nunca duplicada.';


-- 7. As agregações que o Chat consulta
create or replace function public.expense_report(
  p_from          timestamptz,
  p_to            timestamptz,
  p_category_ids  int[]   default null,
  p_uncategorized boolean default false,
  p_search        text    default null
)
returns table (total_brl numeric, quantity int)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(e.amount_brl), 0)::numeric(12,2),
         count(*)::int
    from public.expense e
   where e.occurred_at >= p_from
     and e.occurred_at <  p_to
     and (case
            when p_uncategorized then e.category_id is null
            when p_category_ids is null then true
            else e.category_id = any (p_category_ids)
          end)
     and (p_search is null or e.name ilike '%' || p_search || '%');
$$;

comment on function public.expense_report(timestamptz, timestamptz, int[], boolean, text) is
  'Total (em reais) e quantidade de gastos num recorte: período, categorias (a subárvore já resolvida pela Edge Function), só-sem-categoria, e busca por nome. security invoker de propósito — a RLS de expense se aplica, então a IA soma o que o dono somaria e nada além.';

create or replace function public.expense_by_category(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (category_id int, quantity int, total_brl numeric)
language sql
stable
set search_path = ''
as $$
  select e.category_id,
         count(*)::int,
         sum(e.amount_brl)::numeric(12,2)
    from public.expense e
   where e.occurred_at >= p_from
     and e.occurred_at <  p_to
   group by e.category_id
   order by 3 desc;
$$;

comment on function public.expense_by_category(timestamptz, timestamptz) is
  'Gastos do período agrupados pela categoria DIRETA em que foram lançados (category_id nulo = Sem categoria), do maior total para o menor. Não rola para as categorias-mãe de propósito: quem soma a subárvore é a Edge Function, que tem a árvore — somar aqui contaria o mesmo dinheiro duas vezes.';

create or replace function public.income_report(
  p_from   timestamptz,
  p_to     timestamptz,
  p_search text default null
)
returns table (total_brl numeric, quantity int)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(i.amount_brl), 0)::numeric(12,2),
         count(*)::int
    from public.income i
   where i.received_at >= p_from
     and i.received_at <  p_to
     and (p_search is null or i.name ilike '%' || p_search || '%');
$$;

comment on function public.income_report(timestamptz, timestamptz, text) is
  'Total (em reais) e quantidade de receitas num recorte: período e busca por nome. Sem filtro de categoria — receita não tem. security invoker: a RLS de income se aplica.';

create or replace function public.ai_log_report(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (messages int, cost_usd_cents numeric, tokens_input int, tokens_output int)
language sql
stable
set search_path = ''
as $$
  select count(*)::int,
         coalesce(sum(l.cost_usd_cents), 0)::numeric(14,6),
         coalesce(sum(l.tokens_input), 0)::int,
         coalesce(sum(l.tokens_output), 0)::int
    from public.ai_log l
   where l.created_at >= p_from
     and l.created_at <  p_to;
$$;

comment on function public.ai_log_report(timestamptz, timestamptz) is
  'Consumo de IA de um período: mensagens, custo em centavos de dólar e tokens. Soma TUDO, inclusive o que o usuário limpou da conversa — limpar não apaga o custo já pago. security invoker: a RLS de ai_log se aplica, então cada um soma o próprio consumo.';


-- 8. Grants — menor privilégio
revoke all    on public.ai_log from anon, authenticated;
grant  select on public.ai_log to   authenticated;

revoke execute on function public.ai_log_add_turn(text, text, text, numeric, text, int, int, text, jsonb, jsonb, numeric, text, int, int, int) from public, anon;
grant  execute on function public.ai_log_add_turn(text, text, text, numeric, text, int, int, text, jsonb, jsonb, numeric, text, int, int, int) to   authenticated;

revoke execute on function public.chat_clear() from public, anon;
grant  execute on function public.chat_clear() to   authenticated;

revoke execute on function public.category_resolve_path(text[], text) from public, anon;
grant  execute on function public.category_resolve_path(text[], text) to   authenticated;

revoke execute on function public.expense_report(timestamptz, timestamptz, int[], boolean, text) from public, anon;
grant  execute on function public.expense_report(timestamptz, timestamptz, int[], boolean, text) to   authenticated;

revoke execute on function public.expense_by_category(timestamptz, timestamptz) from public, anon;
grant  execute on function public.expense_by_category(timestamptz, timestamptz) to   authenticated;

revoke execute on function public.income_report(timestamptz, timestamptz, text) from public, anon;
grant  execute on function public.income_report(timestamptz, timestamptz, text) to   authenticated;

revoke execute on function public.ai_log_report(timestamptz, timestamptz) from public, anon;
grant  execute on function public.ai_log_report(timestamptz, timestamptz) to   authenticated;

grant execute on function public.category_reactivate(int) to authenticated;

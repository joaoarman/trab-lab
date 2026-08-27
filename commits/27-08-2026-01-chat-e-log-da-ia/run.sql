-- =========================================================================
-- run.sql — TODO o SQL rodado na implementação 06 (Chat e Log da IA).
-- Data: 27/08/2026
--
-- DUAS migrations, e a ORDEM importa. Copiar e colar no SQL Editor do Supabase,
-- de uma vez, de cima para baixo. Estado resultante do banco:
-- supabase/schema/ (por entidade) e supabase/schema/full_schema.sql (completo).
--
--   1. 20260826230524_chat-e-log-da-ia.sql
--      A tabela `public.ai_log` (conversa E auditoria numa tabela só), as RPCs
--      do turno (`ai_log_add_turn`, `chat_clear`), o achar-ou-criar de caminho de
--      categoria (`category_resolve_path`) e as agregações que a Edge Function
--      consulta.
--
--   2. 20260827102122_consulta-sem-periodo.sql
--      `p_from`/`p_to` de `expense_report` e `income_report` passam a aceitar
--      NULL. Escrita DEPOIS porque as duas funções nascem na migration 1 — é um
--      `create or replace` sobre elas.
--
-- DEPENDE das implementações 03, 04 e 05: `category`, `expense` e `income` já
-- existem, e a IA escreve nelas pelas MESMAS policies e grants que as telas usam.
-- Nada aqui afrouxa o acesso de nenhum módulo anterior.
--
-- ⚠️ ESTE SQL NÃO BASTA. O Chat só funciona depois de:
--      supabase functions deploy chat
--      supabase functions deploy transcribe
--      supabase secrets set --env-file supabase/functions/.env
--    e do `supabase config push` (os blocos [functions.*] do config.toml).
-- =========================================================================


-- >>> supabase/migrations/20260826230524_chat-e-log-da-ia.sql

-- =========================================================================
-- 20260826230524_chat-e-log-da-ia.sql
--
-- O módulo Chat e o módulo Log da IA — que compartilham UMA TABELA SÓ.
--
-- ## Por que uma tabela, e não duas
--
-- A tentação natural é `chat_message` (o que vira bolha) + `ai_log` (o que a IA
-- fez e quanto custou). Seriam duas tabelas com a MESMA cardinalidade — uma
-- linha de log por mensagem —, ligadas 1:1, e toda leitura das duas telas teria
-- de costurá-las de volta. Pior: as duas poderiam divergir (uma mensagem sem
-- log, um log sem mensagem), e o log existe justamente para ser a prova do que
-- aconteceu. Prova que pode faltar não é prova.
--
-- Então é uma tabela só, `public.ai_log`, e as duas telas são dois RECORTES
-- dela:
--   • **Chat**  — `is_active`, ordenado por id, lendo `role`/`content`/`kind`/
--     `receipts`. É a conversa.
--   • **Log da IA** — TUDO (inclusive o que o usuário limpou da conversa), lendo
--     também `ai_model`, os tokens, `cost_usd_cents` e `tool_calls`. É a
--     auditoria.
--
-- O nome da tabela é o do papel mais amplo: toda linha é log; nem toda linha
-- precisa virar bolha.
--
-- ## O que roda nesta migration
--
--   1. a tabela `public.ai_log`;
--   2. `ai_log_add_turn`   — grava o turno (pergunta + resposta) numa transação;
--   3. `chat_clear`        — o "limpar conversa" (is_active = false, nunca delete);
--   4. `category_resolve_path` — o achar-ou-criar de `Carro › Gasolina` que
--      permite ao Chat classificar um gasto sem o usuário ter criado a árvore;
--   5. `expense_report` / `expense_by_category` / `income_report` — as
--      agregações que a Edge Function consulta para responder "quanto gastei…"
--      sem trazer quinhentas linhas para dentro do prompt;
--   6. `ai_log_report` — a mesma ideia para o consumo de IA: é o rodapé de
--      totais da tela do Log;
--   7. índices, RLS, policies e grants de tudo isso.
--
-- Além disso, CORRIGE um desvio do retrato: `grant execute on
-- category_reactivate to authenticated` existia na migration de Categorias
-- (20260826100316, linha 540) mas não tinha sido copiado para
-- `supabase/schema/grants.sql`. O banco está certo; era o retrato que estava
-- errado. A linha é repetida aqui para que rodar esta migration num banco
-- recriado só a partir de `schema/` também acerte.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. public.ai_log — a conversa E a auditoria, numa tabela só
-- -------------------------------------------------------------------------
-- UMA conversa por usuário, sem fim e sem título. Por isso não existe tabela de
-- conversa: ela seria uma linha por perfil, sempre a mesma, e todo
-- `conversation_id` do sistema seria uma indireção para o que `profile_id` já
-- diz.
--
-- NADA AQUI É APAGADO. Não há grant nem policy de delete, e "limpar a conversa"
-- é `is_active = false`. O motivo é o log: se a linha sumisse, sumiria junto a
-- única contabilidade de quanto a IA custou e o único registro do que ela fez.
create table if not exists public.ai_log (
  id         int generated always as identity primary key,
  -- Dono. Diferente das outras tabelas do sistema, NÃO há DEFAULT
  -- current_profile_id(): esta tabela não é escrita pelo cliente em nenhuma
  -- hipótese (não há grant de insert), e quem a escreve é `ai_log_add_turn`,
  -- que resolve o perfil por conta própria. Um default aqui seria uma porta
  -- que nada usa.
  profile_id int not null references public.profile (id) on delete cascade,

  -- Quem falou. Inglês MAIÚSCULO como todo domínio fechado do projeto.
  -- 'SYSTEM' não entra: o system prompt não é conversa — ele é montado a cada
  -- chamada, em supabase/functions/chat/prompts.ts.
  role       text not null constraint ai_log_role_valid
               check (role in ('USER', 'ASSISTANT')),

  -- O texto da bolha. Já transcrito, quando veio de áudio.
  content    text not null constraint ai_log_content_length
               check (char_length(content) between 1 and 8000),

  -- Como a mensagem ENTROU. Serve para a bolha marcar o que foi ditado: quando
  -- a transcrição erra uma palavra, quem lê precisa reconhecer que aquilo veio
  -- do microfone e não do teclado. Só se aplica ao usuário.
  source     text not null default 'TEXT' constraint ai_log_source_valid
               check (source in ('TEXT', 'AUDIO')),

  -- O QUE esta linha é, para a tela saber como pintá-la.
  --
  --   MESSAGE — a resposta normal.
  --   REFUSAL — o assunto estava FORA do sistema. A tela desenha em vermelho.
  --
  -- É uma coluna, e não uma dedução do texto, porque a tela não pode ficar
  -- procurando uma frase dentro do que um modelo de linguagem escreveu: bastaria
  -- o modelo mudar uma palavra para a recusa deixar de ser vermelha, ou para uma
  -- resposta legítima virar vermelha por citar a frase. Quem carimba é a Edge
  -- Function, e ela sabe pelo fato — a ferramenta de recusa rodou ou não rodou.
  kind       text not null default 'MESSAGE' constraint ai_log_kind_valid
               check (kind in ('MESSAGE', 'REFUSAL')),

  -- Os CARTÕES DE CONFIRMAÇÃO desta resposta: um por registro criado, editado ou
  -- excluído no turno. É um array JSON — `[{ "acao": "criado", "tipo": "gasto",
  -- "nome": "posto de gasolina", "valor": 20, "moeda": "USD", "cotacao": 5.4210,
  -- "valorEmBrl": 108.42, "categoria": ["Carro", "Gasolina"], … }]`.
  --
  -- POR QUE JSON, e não colunas (ou uma FK para expense/income/category)
  --
  -- O cartão é um RECIBO: o retrato do registro no instante em que foi salvo. Uma
  -- FK apontaria para a linha viva, e a bolha de três semanas atrás passaria a
  -- exibir o valor de hoje — ou a sumir, quando o registro fosse excluído. Um
  -- recibo que muda depois de emitido não serve para conferir nada, e conferir é
  -- exatamente o que este cartão existe para permitir.
  --
  -- Colunas fixas também não servem: as três entidades (gasto, receita,
  -- categoria) têm campos diferentes, e um turno pode salvar várias de uma vez
  -- ("gastei 20 no posto e 50 no mercado").
  receipts   jsonb constraint ai_log_receipts_is_array
               check (receipts is null or jsonb_typeof(receipts) = 'array'),

  -- As FERRAMENTAS que rodaram neste turno, com os argumentos e o desfecho —
  -- `[{ "nome": "registrar_gasto", "argumentos": {…}, "ok": true }]`.
  --
  -- É a coluna que responde à pergunta do módulo Log da IA: "o que a IA fez com a
  -- minha mensagem?". Sem ela, o log diria quanto custou sem dizer o que foi
  -- feito — e o custo sozinho não audita nada.
  tool_calls jsonb constraint ai_log_tool_calls_is_array
               check (tool_calls is null or jsonb_typeof(tool_calls) = 'array'),

  -- O modelo vai gravado NA LINHA, e não deduzido da constante de prompts.ts: a
  -- constante muda, e sem isto trocar de modelo reescreveria o passado.
  ai_model   text,

  -- Tokens cobrados. Sem eles o custo é um número sem prestação de contas: não
  -- dá para saber se foram muitos tokens baratos ou poucos caros, nem o que
  -- mudou quando a conta subir. `tokens_input_cached` é um PEDAÇO de
  -- `tokens_input` (a parte que veio do cache de prompt da OpenAI, pela metade
  -- do preço), não um extra a somar — e só a conversa tem cache; na transcrição
  -- ele fica nulo.
  tokens_input        int,
  tokens_input_cached int,
  tokens_output       int,

  -- Quanto esta mensagem custou de IA, em CENTAVOS DE DÓLAR — e FRACIONÁRIO: uma
  -- chamada custa menos de um centavo, então centavo aqui não vira inteiro. Seis
  -- casas guardam a mesma precisão absoluta de oito casas em dólar (10⁻⁸ dólar =
  -- 10⁻⁶ centavo); com menos, as chamadas mais baratas arredondariam para zero,
  -- que aqui significaria "de graça".
  --
  -- `numeric` e nunca `float`, por regra do projeto: este número
  -- existe para ser SOMADO (por dia, por mês, por período do filtro), e a soma de
  -- uma lista longa em ponto flutuante acumula erro.
  --
  -- Preenchido na resposta do ASSISTENTE (a conversa inteira, somando as rodadas
  -- de ferramenta) e na mensagem de ÁUDIO do usuário (a transcrição). NULL numa
  -- mensagem digitada: não houve chamada — e null é "não se aplica", nunca "saiu
  -- de graça".
  cost_usd_cents numeric(12, 6),

  -- False = o usuário limpou a conversa. A mensagem some da tela do Chat e do
  -- contexto que vai à IA, mas CONTINUA no banco e continua na tela do Log —
  -- limpar a conversa não pode levar embora a auditoria nem o custo já pago.
  is_active  boolean not null default true,

  created_at timestamptz not null default now(),

  -- A IA nunca é ditada: (ASSISTANT, AUDIO) seria um registro impossível.
  constraint ai_log_audio_is_user check (source = 'TEXT' or role = 'USER'),
  -- Recusar é ato de quem responde. (USER, REFUSAL) não existe.
  constraint ai_log_refusal_is_assistant check (kind = 'MESSAGE' or role = 'ASSISTANT'),
  -- Cartão e ferramenta são do lado da IA: a mensagem do usuário é só o que ele
  -- disse. Guardá-los na linha dele duplicaria o turno e faria a soma do log
  -- contar cada ferramenta duas vezes.
  constraint ai_log_payload_is_assistant check (
    role = 'ASSISTANT' or (receipts is null and tool_calls is null)
  ),
  constraint ai_log_cost_positive check (cost_usd_cents is null or cost_usd_cents >= 0),
  -- Contagem negativa é dado corrompido, não caso de borda. E o cacheado é um
  -- PEDAÇO da entrada: maior que ela seria conta impossível, e a checagem pega na
  -- hora um mapeamento errado do `usage` da API.
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


-- -------------------------------------------------------------------------
-- 2. Índices
-- -------------------------------------------------------------------------

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


-- -------------------------------------------------------------------------
-- 3. RLS + policies
-- -------------------------------------------------------------------------
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


-- -------------------------------------------------------------------------
-- 4. ai_log_add_turn — grava o turno inteiro, ou nada
-- -------------------------------------------------------------------------
-- A pergunta e a resposta entram numa TRANSAÇÃO SÓ e voltam prontas para a tela.
-- É atômico de propósito: metade de um turno é pior do que nenhum — uma pergunta
-- sem resposta ficaria como bolha órfã esperando para sempre, e uma resposta sem
-- pergunta faria a conversa parecer que a IA falou sozinha.
--
-- É a ÚNICA forma de escrever em public.ai_log: não há grant nem policy de
-- insert. Chamada pela Edge Function `chat` com o JWT DO USUÁRIO, nunca com
-- service_role — o perfil sai de auth.uid(), então nem a função nem o modelo
-- conseguem gravar na conversa de outra pessoa.
create or replace function public.ai_log_add_turn(
  p_user_content      text,
  p_assistant_content text,
  p_user_source       text default 'TEXT',

  -- A mensagem do USUÁRIO só tem extrato de IA quando veio de áudio: o custo é o
  -- da transcrição, que rodou na outra Edge Function, antes de esta linha existir.
  p_user_cost_usd_cents numeric default null,
  p_user_model          text    default null,
  p_user_tokens_input   int     default null,
  p_user_tokens_output  int     default null,

  -- A resposta do ASSISTENTE.
  p_assistant_kind            text    default 'MESSAGE',
  p_assistant_receipts        jsonb   default null,
  p_assistant_tool_calls      jsonb   default null,
  p_assistant_cost_usd_cents  numeric default null,
  p_assistant_model           text    default null,
  -- Todas as rodadas de ferramenta somadas: um turno com quatro idas ao modelo
  -- custou as quatro, e o extrato tem de dizer isso.
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

  -- `current_profile_id()` já filtra conta desativada, então isto também é o que
  -- fecha o Chat para quem cancelou a conta: sem perfil, não há turno.
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

  -- Mensagem DIGITADA não chamou IA nenhuma: não há custo, modelo nem token a
  -- guardar. O descarte acontece aqui, e não na Edge Function, para que a regra
  -- valha para qualquer um que um dia chame esta RPC.
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


-- -------------------------------------------------------------------------
-- 5. chat_clear — o "limpar conversa"
-- -------------------------------------------------------------------------
-- As mensagens somem da tela do Chat e do contexto que vai à IA, mas NÃO do
-- banco: é `is_active = false`, nunca delete. A tela do Log continua mostrando
-- tudo, e o custo já pago continua contabilizado.
--
-- É uma RPC, e não um update do cliente, porque não há grant de update na tabela.
-- Com grant, o mesmo caminho que limpa a conversa poderia reescrever o custo — e
-- a auditoria deixaria de ser auditoria.
--
-- Devolve quantas linhas saíram da conversa, para a tela poder dizer o que fez.
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


-- -------------------------------------------------------------------------
-- 6. category_resolve_path — o achar-ou-criar de `Carro › Gasolina`
-- -------------------------------------------------------------------------
-- É a função que faz o Chat cumprir a promessa do produto: "gastei 20 no posto"
-- vira um gasto em **Carro › Gasolina**, e a hierarquia é criada na hora se ainda
-- não existir. Sem isto, a IA teria de mandar o usuário abrir a tela de
-- Categorias antes de registrar — exatamente a fricção que o sistema existe para
-- eliminar.
--
-- Recebe o CAMINHO ('{Carro,Gasolina}') e devolve o id da FOLHA, criando cada
-- degrau que faltar. O caminho, e não o nome solto, porque a mesma folha pode
-- existir em dois galhos ("Casa › Mercado" e "Trabalho › Mercado") e um nome
-- sozinho não escolheria entre eles.
--
-- ## A comparação é por nome, sem maiúsculas — a mesma do índice
--
-- `lower(btrim(name))` é exatamente o que `category_sibling_name_uk` indexa. Tem
-- de ser: se esta função procurasse de um jeito e o índice barrasse de outro,
-- "gasolina" não acharia "Gasolina" e o insert seguinte bateria no unique. O
-- usuário veria um erro por ter falado com letra minúscula.
--
-- ## Categoria DESATIVADA é reaproveitada, e reativada
--
-- Se a pessoa está gastando com Gasolina de novo, a gaveta volta para a árvore.
-- A alternativa seria criar uma segunda "Gasolina" ao lado da desativada — o que
-- o índice único recusa —, ou registrar o gasto numa categoria que o usuário não
-- enxerga na tela. As duas são piores.
--
-- `security definer` porque a função precisa DESCER pela árvore conferindo cada
-- degrau, e essa descida não pode depender da RLS de quem chamou. Toda consulta
-- é presa a `v_profile_id`, então não há linha de terceiro alcançável por aqui.
create or replace function public.category_resolve_path(
  p_path  text[],
  -- A cor das categorias criadas no caminho. Null = o default da coluna. É um
  -- parâmetro (e não sempre o default) para o Chat poder dar a uma árvore nova a
  -- cor que combina com o assunto, em vez de deixar tudo esmeralda.
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

  -- Teto de profundidade. A árvore é livre por desenho, mas um caminho de vinte
  -- degraus vindo de um modelo de linguagem é engano, não hierarquia — e criá-lo
  -- deixaria na conta da pessoa vinte categorias para apagar à mão.
  if array_length(p_path, 1) > 5 then
    raise exception 'category_path_too_deep' using errcode = 'P0001';
  end if;

  for i in 1 .. array_length(p_path, 1) loop
    v_nome := btrim(p_path[i]);

    if v_nome = '' or char_length(v_nome) > 60 then
      raise exception 'category_name_invalid' using errcode = 'P0001';
    end if;

    -- `coalesce(parent_id, 0) = coalesce(v_parent_id, 0)`: em SQL, null não é
    -- igual a null, então comparar as duas colunas direto nunca acharia uma
    -- categoria de topo. É o mesmo coalesce que o índice único usa — as duas
    -- coisas têm de enxergar "irmã" da mesma forma.
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
      -- Achada, mas fora da árvore. A reativação não acontece degrau a degrau
      -- aqui dentro: quem sabe subir a cadeia inteira de mães é
      -- category_reactivate, e chamá-la uma vez no fim é o que garante que a
      -- folha volte VISÍVEL, e não pendurada numa mãe ainda desativada.
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


-- -------------------------------------------------------------------------
-- 7. As agregações que o Chat consulta
-- -------------------------------------------------------------------------
-- "Quanto gastei nos últimos 15 dias com Carro?" tem UMA resposta: um número. Sem
-- estas funções, a Edge Function traria as trezentas linhas do período para somar
-- em JavaScript — e as trezentas linhas ainda teriam de caber no contexto do
-- modelo, que é onde o token custa dinheiro.
--
-- ## Todas são `security invoker` (o padrão), e isso é o ponto
--
-- Nenhuma leva `security definer`: elas rodam com os privilégios de quem chamou,
-- então a RLS de `expense`/`income` se aplica exatamente como se aplica à tela.
-- A Edge Function usa o JWT do usuário, logo a IA soma o que o dono somaria, e
-- nada além. Um `security definer` aqui abriria a soma do sistema inteiro para
-- quem soubesse chamar a RPC.
--
-- ## O período chega em `timestamptz`, fechado no início e ABERTO no fim
--
-- É a mesma convenção de `shared/utils/datas.ts` e das queries das telas: `>= de`
-- e `< até`, com `até` sendo o começo do dia seguinte. Comparar `<= '2026-08-31'`
-- deixaria de fora tudo o que aconteceu depois da meia-noite daquele dia — o
-- último dia do recorte inteiro, silenciosamente.

-- -------------------------------------------------------------------------
-- expense_report — o total e a contagem de um recorte de gastos
-- -------------------------------------------------------------------------
-- `p_category_ids` já chega com a SUBÁRVORE inteira resolvida. Quem a resolve é a
-- Edge Function, que carrega a árvore de categorias no prompt e portanto já sabe
-- quem desce de quem — pedir ao banco para recalcular a recursiva a cada pergunta
-- seria refazer, por consulta, um trabalho que já está feito na memória.
--
-- Os três filtros são independentes e todos opcionais:
--   • `p_category_ids` null = todas as categorias;
--   • `p_uncategorized` true = SÓ os gastos sem categoria (e aí os ids são
--     ignorados). São perguntas diferentes — "quanto gastei com Carro" e "quanto
--     gastei sem classificar" —, e um `null` no array não conseguiria dizer a
--     segunda;
--   • `p_search` filtra pelo nome do gasto, sem maiúsculas e sem acento posicional
--     (ILIKE com % dos dois lados). É como se responde "quanto gastei no posto?"
--     quando "posto" é o texto do gasto, e não uma categoria.
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

-- -------------------------------------------------------------------------
-- expense_by_category — o mesmo recorte, quebrado por categoria DIRETA
-- -------------------------------------------------------------------------
-- Devolve a categoria em que o gasto foi lançado, sem rolar nada para cima: quem
-- soma "Carro › Gasolina" dentro de "Carro" é a Edge Function, que tem a árvore.
-- Fazer a rolagem aqui obrigaria a uma recursiva por linha e devolveria o mesmo
-- dinheiro contado duas vezes (uma na folha, outra na mãe) — um relatório que não
-- fecha com o próprio total.
--
-- `category_id` nulo é uma linha legítima do resultado: é o "Sem categoria".
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

-- -------------------------------------------------------------------------
-- income_report — o espelho de expense_report, sem categoria
-- -------------------------------------------------------------------------
-- Dois parâmetros a menos, e a ausência é o módulo: receita não tem categoria
-- (ver o comentário de public.income). O que sobra é o período e a busca por
-- nome, que aqui é a pergunta principal — "quanto recebi de freela esse ano?" se
-- responde pelo nome, porque o nome é o único descritor que a receita tem.
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


-- -------------------------------------------------------------------------
-- ai_log_report — o consumo de IA de um período
-- -------------------------------------------------------------------------
-- O rodapé da tela do Log da IA: quantas mensagens, quanto custou e quantos
-- tokens, num recorte de tempo.
--
-- Existe pelo mesmo motivo de `expense_report`: somar no cliente exigiria trazer
-- todas as linhas do período, e a tela só lista as mais recentes. Um total somado
-- sobre a página visível seria menor que a verdade, com cara de resposta certa —
-- que é o defeito que este sistema mais evita.
--
-- SOMA TUDO, inclusive o que o usuário limpou da conversa (`is_active = false`).
-- É o ponto do módulo: limpar a conversa não apaga o custo já pago à OpenAI, e um
-- relatório que perdesse essas linhas subdeclararia o consumo justo de quem mais
-- usa o chat.
--
-- `coalesce` no custo porque `sum` de um conjunto vazio é null, e a tela precisa
-- de um zero para escrever "R$ 0,00" em vez de nada. Nos tokens o coalesce faz o
-- mesmo — e note que aqui zero é a resposta certa: nenhuma mensagem, nenhum token.
-- É diferente do null de UMA linha, que significa "não houve chamada de IA".
--
-- `security invoker` (o padrão): a RLS de ai_log se aplica, então cada um soma o
-- próprio consumo.
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


-- -------------------------------------------------------------------------
-- 8. Grants — menor privilégio
-- -------------------------------------------------------------------------

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

-- --- correção do retrato --------------------------------------------------
-- Esta linha já rodou na migration de Categorias (20260826100316, linha 540) mas
-- não tinha sido copiada para supabase/schema/grants.sql. Repetida aqui para que
-- um banco recriado a partir do retrato também acerte — sem ela, o botão de
-- reativar do submenu "Desativadas" falharia com "permission denied".
-- `grant` é idempotente: rodar de novo num banco que já a tem não faz nada.
grant execute on function public.category_reactivate(int) to authenticated;


-- >>> supabase/migrations/20260827102122_consulta-sem-periodo.sql

-- =============================================================================
-- CONSULTA SEM PERÍODO — "qual foi o último gasto que eu registrei?"
--
-- ## O que estava errado
--
-- `expense_report` e `income_report` nasceram com o período OBRIGATÓRIO, porque
-- toda tela que as chama tem um filtro de período em cima (Gastos, Receitas, Log
-- da IA). Faz sentido para uma tela: ali o recorte sempre existe, nem que seja
-- "este mês".
--
-- Na conversa não é assim. "Qual foi o último gasto que eu registrei?" não tem
-- recorte nenhum — e não é uma pergunta esquisita, é das mais naturais que se faz
-- a um assistente. Sem um jeito de perguntar "o mais recente, seja de quando
-- for", a IA precisava INVENTAR um período para poder consultar. E quando ela não
-- inventava, respondia com o que tinha à mão: o histórico da conversa. Foi o que
-- aconteceu — "não há registro de gastos anteriores nesta conversa", com o banco
-- cheio de gastos.
--
-- ## A mudança
--
-- `p_from` e `p_to` passam a aceitar NULL, com o significado óbvio: **sem limite
-- daquele lado**. Os dois nulos = a série inteira.
--
-- É uma extensão pura, não uma quebra: `p_from is null or ...` só acrescenta um
-- caso ao que já existia, e toda chamada que passa as duas datas continua se
-- comportando exatamente como antes. As telas não precisam mudar nada.
--
-- ## Por que não bastava mandar uma data bem antiga da Edge Function
--
-- Porque "1970-01-01" é um período, e um período é uma afirmação: ela apareceria
-- no log de auditoria como se a IA tivesse decidido consultar desde 1970. O nulo
-- diz a verdade — não havia recorte —, e é isso que o Log da IA precisa mostrar
-- quando alguém for conferir o que a IA perguntou ao banco.
--
-- Nada de RLS muda aqui: as duas funções continuam `security invoker` (sem
-- `security definer`), então quem lê é o usuário do JWT e as policies de
-- `expense` / `income` seguem valendo linha a linha.
--
-- ⚠️ Rode no SQL Editor. `create or replace` mantém os grants existentes, porque
-- a ASSINATURA não muda: os tipos dos parâmetros são os mesmos, só ganharam
-- `default null`. Se a assinatura mudasse, o `grant execute` teria de ser
-- refeito — e é por isso que o `default` entra sem mexer nos tipos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- expense_report — total e quantidade de gastos de um recorte (agora opcional)
-- -----------------------------------------------------------------------------
create or replace function public.expense_report(
  p_from          timestamptz default null,
  p_to            timestamptz default null,
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
   -- Null = sem limite deste lado. O recorte continua FECHADO no início e ABERTO
   -- no fim quando as datas vêm, que é a convenção do resto do sistema
   -- (`src/shared/utils/datas.ts` e `limitesDoPeriodo`, na Edge Function).
   where (p_from is null or e.occurred_at >= p_from)
     and (p_to   is null or e.occurred_at <  p_to)
     and (case
            when p_uncategorized then e.category_id is null
            when p_category_ids is null then true
            else e.category_id = any (p_category_ids)
          end)
     and (p_search is null or e.name ilike '%' || p_search || '%');
$$;

-- -----------------------------------------------------------------------------
-- income_report — o mesmo, do lado das receitas
-- -----------------------------------------------------------------------------
create or replace function public.income_report(
  p_from   timestamptz default null,
  p_to     timestamptz default null,
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
   where (p_from is null or i.received_at >= p_from)
     and (p_to   is null or i.received_at <  p_to)
     and (p_search is null or i.name ilike '%' || p_search || '%');
$$;

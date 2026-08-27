-- =========================================================================
-- full_schema.sql — estado COMPLETO do banco, na ordem de execução.
-- Ordem: 1.extensions 2.enums 3.tables 4.indexes 5.functions 6.triggers
--        7.views 8.RLS+policies 9.grants 10.realtime 11.storage 12.seeds
-- Recria o banco do zero (mover de instância/país): copiar e colar no SQL Editor.
-- =========================================================================

-- ############ 1. EXTENSIONS ############
-- (nenhuma além das que o Supabase já traz)

-- ############ 2. ENUMS ############
-- -------------------------------------------------------------------------
-- currency — as moedas aceitas em um lançamento.
-- Domínio FECHADO de propósito: um `text` aceitaria 'R$', 'reais', 'brl' e
-- 'BRL ' como quatro moedas diferentes. O padrão é BRL; USD é convertido para
-- reais na gravação (ver expense_guard em functions.sql).
-- -------------------------------------------------------------------------
do $$
begin
  if to_regtype('public.currency') is null then
    create type public.currency as enum ('BRL', 'USD');
  end if;
end
$$;

comment on type public.currency is 'Moedas aceitas em um lançamento. BRL é o padrão; USD é convertido para reais na gravação.';

-- ############ 3. TABLES ############

-- -------------------------------------------------------------------------
-- profile — o perfil do usuário, ponte entre auth.users e o resto do sistema.
-- Tenancy: B2C por usuário. Todo dado do sistema referencia profile.id (int).
-- -------------------------------------------------------------------------
create table if not exists public.profile (
  id          int generated always as identity primary key,
  auth_uuid   uuid not null unique references auth.users (id) on delete cascade,
  full_name   text not null default '',
  -- Espelho de auth.users.email; escrito SÓ pelo trigger on_auth_user_email_updated.
  email       text not null default '',
  -- Caminho no bucket `avatars` ('<auth_uuid>/avatar.jpg'), NÃO uma URL.
  avatar_path text,
  -- Soft-delete. Null = ativa. Respeitado por current_profile_id().
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.profile             is 'Perfil do usuário — a ponte entre auth.users e o resto do sistema.';
comment on column public.profile.auth_uuid   is 'auth.users.id. Ligação com o Supabase Auth.';
comment on column public.profile.email       is 'Espelho de auth.users.email. Escrito SÓ pelo trigger de sync.';
comment on column public.profile.avatar_path is 'Caminho no bucket avatars (<auth_uuid>/avatar.jpg), não uma URL.';
comment on column public.profile.deleted_at  is 'Soft-delete. Null = ativa. Preenchida = a sessão é derrubada.';

-- --- ADIANTADO DA SEÇÃO 5 (dependência de DEFAULT) -----------------------
-- `current_profile_id()` é definida aqui, ANTES das tabelas, e não só lá na
-- seção 5. Não é duplicação por descuido: `category.profile_id` e
-- `expense.profile_id` a usam como DEFAULT, e o PostgreSQL resolve a expressão
-- de um DEFAULT no momento do `create table` — com ela definida só depois, um
-- `full_schema` rodado do zero morreria na primeira tabela, com "function
-- public.current_profile_id() does not exist".
--
-- Na seção 5 ela reaparece com o comentário completo. `create or replace`
-- executado duas vezes é inofensivo: a segunda passada só reescreve a mesma
-- função.
create or replace function public.current_profile_id()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select id
    from public.profile
   where auth_uuid = auth.uid()
     and deleted_at is null
$$;

-- -------------------------------------------------------------------------
-- category — a hierarquia de categorias (auto-relacionada), por perfil.
-- Excluir é SOFT-DELETE (deleted_at); excluída é sempre inativa. Ter filha (ou,
-- no futuro, lançamento) conta como vínculo: nesse caso a categoria é DESATIVADA
-- junto com a subárvore, em vez de excluída. Ver functions.sql (category_remove).
-- -------------------------------------------------------------------------
create table if not exists public.category (
  id         int generated always as identity primary key,
  -- Dono. O DEFAULT é o que permite o front inserir sem mencionar o profile_id —
  -- ele não tem grant nesta coluna, então não pode forjar o dono.
  profile_id int not null default public.current_profile_id()
             references public.profile (id) on delete cascade,
  -- Categoria mãe. Null = topo. A FK real é composta (ver category_parent_fk).
  parent_id  int,
  name       text not null,
  -- Etiqueta hexadecimal escolhida pelo usuário. É DADO, não tema (src/theme.css).
  color      text not null default '#10b981',
  -- False = desativada: sai da árvore principal, vai para o submenu "Desativadas".
  is_active  boolean not null default true,
  -- Soft-delete. Preenchida = excluída (a RLS deixa de devolver a linha).
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint category_name_len   check (char_length(name) between 1 and 60),
  constraint category_color_hex  check (color ~ '^#[0-9a-f]{6}$'),
  -- O ciclo de tamanho 1; os maiores (A → B → A) são caçados por category_guard().
  constraint category_no_self_parent check (parent_id is distinct from id),
  -- Excluída é sempre inativa — nem um UPDATE manual cria a linha ambígua.
  constraint category_deleted_is_inactive check (deleted_at is null or is_active = false),

  -- Alvo da FK composta abaixo. Redundante com a PK, de propósito.
  constraint category_id_profile_uk unique (id, profile_id),
  -- profile_id NOS DOIS LADOS: a árvore não atravessa contas, e isso é garantido
  -- por integridade referencial — não por uma policy que se pode esquecer.
  constraint category_parent_fk foreign key (parent_id, profile_id)
             references public.category (id, profile_id)
             on update cascade on delete cascade
);

comment on table  public.category            is 'Hierarquia de categorias do usuário (auto-relacionada). Organiza gastos e receitas.';
comment on column public.category.profile_id is 'Dono. Preenchido pelo DEFAULT current_profile_id() — o cliente não tem grant nesta coluna.';
comment on column public.category.parent_id  is 'Categoria mãe. Null = categoria de topo. FK composta com profile_id: a árvore nunca atravessa perfis.';
comment on column public.category.color      is 'Etiqueta hexadecimal escolhida pelo usuário (#rrggbb). É dado, não tema — o tema vive em src/theme.css.';
comment on column public.category.is_active  is 'False = desativada: some da árvore principal e vai para o submenu "Desativadas". Só muda pelas RPCs.';
comment on column public.category.deleted_at is 'Soft-delete. Preenchida = excluída (a RLS deixa de devolver a linha). Força is_active = false.';

-- -------------------------------------------------------------------------
-- expense — os gastos do usuário: o dinheiro que saiu.
-- DINHEIRO É `numeric(12,2)` — reais e centavos na mesma coluna, como se lê. O
-- que NÃO se usa é `float`: numeric é decimal EXATO e a soma fecha. Duas colunas
-- de valor: `amount` é o que se gastou na moeda em que se gastou; `amount_brl` é
-- o mesmo em reais, e é ele que TODO total soma. Quem converte é a trigger
-- expense_guard() — o cliente não tem grant na coluna.
-- Excluir é SOFT-DELETE (deleted_at) e excluído é sempre inativo, igual a
-- `category`. Ver functions.sql (expense_guard, expense_remove).
-- -------------------------------------------------------------------------
create table if not exists public.expense (
  id         int generated always as identity primary key,
  -- Dono. O DEFAULT é o que permite o front inserir sem mencionar o profile_id —
  -- ele não tem grant nesta coluna, então não pode forjar o dono.
  profile_id int not null default public.current_profile_id()
             references public.profile (id) on delete cascade,
  -- Categoria do gasto. NULL = "Sem categoria": quem acabou de criar a conta
  -- registra o primeiro gasto sem ter de criar categoria antes (regra 6).
  -- A FK real é composta (ver expense_category_fk).
  category_id int,
  -- Onde/no que foi o gasto ("posto de gasolina"). A categoria diz a gaveta.
  name       text not null,
  -- Valor na moeda de `currency`. US$ 50,00 = 50.00. numeric, nunca float: em
  -- ponto flutuante 0.1 + 0.2 não dá 0.3, e o extrato deixa de fechar.
  amount     numeric(12,2) not null,
  currency   public.currency not null default 'BRL',
  -- Taxa de câmbio do MOMENTO do registro: quantos reais vale 1 unidade de
  -- `currency`. Null quando já é BRL. Guardada (e não recalculada na leitura)
  -- porque cotação é fato datado — senão o extrato muda de valor toda manhã.
  exchange_rate numeric(14,6),
  -- O mesmo valor em REAIS. Preenchido SÓ pela trigger.
  amount_brl numeric(12,2) not null default 0,
  -- Quando o gasto ACONTECEU (com hora) — não quando foi registrado: dá para
  -- lançar hoje o almoço de ontem, e o extrato ordena pelo fato, não pelo toque.
  occurred_at timestamptz not null default now(),
  -- Hoje só acompanha o deleted_at. Reservada para um "arquivar" futuro.
  is_active  boolean not null default true,
  -- Soft-delete. Preenchida = excluído (a RLS deixa de devolver a linha).
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expense_name_len check (char_length(name) between 1 and 80),
  -- Gasto é sempre positivo (negativo seria receita, que tem tabela própria). O
  -- piso é UM CENTAVO: `> 0` deixaria passar 0.001, arredondado para zero pela
  -- escala. O teto repete o do numeric de propósito — assim a conversão esbarra
  -- numa mensagem traduzível, e não no "numeric field overflow" cru.
  constraint expense_amount_range     check (amount     between 0.01 and 9999999.99),
  constraint expense_amount_brl_range check (amount_brl between 0.01 and 9999999.99),
  -- A coerência do trio (moeda · cotação · valor em reais) como GARANTIA, e não
  -- só como código da trigger: um UPDATE manual esbarra aqui.
  constraint expense_brl_has_no_rate check (
    currency <> 'BRL' or (exchange_rate is null and amount_brl = amount)
  ),
  constraint expense_foreign_has_rate check (
    currency = 'BRL' or (exchange_rate is not null and exchange_rate > 0)
  ),
  -- Excluído é sempre inativo — o mesmo invariante da `category`.
  constraint expense_deleted_is_inactive check (deleted_at is null or is_active = false),

  -- profile_id NOS DOIS LADOS: o gasto nunca se pendura na categoria de outra
  -- pessoa, e isso é integridade referencial — não uma policy que se esquece.
  -- Com category_id nulo a FK não é cobrada (MATCH SIMPLE), que é o que permite
  -- o gasto "Sem categoria".
  constraint expense_category_fk foreign key (category_id, profile_id)
             references public.category (id, profile_id)
             on update cascade on delete cascade
);

comment on table  public.expense                  is 'Gastos do usuário: o dinheiro que saiu. Valores em CENTAVOS, inteiros.';
comment on column public.expense.profile_id       is 'Dono. Preenchido pelo DEFAULT current_profile_id() — o cliente não tem grant nesta coluna.';
comment on column public.expense.category_id      is 'Categoria do gasto. Null = "Sem categoria" (registrar nunca trava). FK composta com profile_id: nunca atravessa perfis.';
comment on column public.expense.name             is 'Onde/no que foi o gasto ("posto de gasolina"). A categoria diz a gaveta; isto diz o episódio.';
comment on column public.expense.amount           is 'Valor na moeda de currency, numeric(12,2). US$ 50,00 = 50.00. numeric, nunca float: a soma tem de fechar.';
comment on column public.expense.currency         is 'Moeda em que o gasto aconteceu. Padrão BRL.';
comment on column public.expense.exchange_rate    is 'Taxa de câmbio do momento do registro: quantos reais vale 1 unidade de currency. Null quando currency = BRL.';
comment on column public.expense.amount_brl       is 'O mesmo valor em REAIS. Calculado pela trigger — é a coluna que todo total do sistema soma.';
comment on column public.expense.occurred_at      is 'Quando o gasto ACONTECEU (com hora) — não quando foi registrado. Dá para lançar hoje o almoço de ontem.';
comment on column public.expense.is_active        is 'Hoje só acompanha o deleted_at (excluído ⇒ inativo). Reservada para um "arquivar" futuro.';
comment on column public.expense.deleted_at       is 'Soft-delete. Preenchida = excluído (a RLS deixa de devolver a linha). Força is_active = false.';

-- -------------------------------------------------------------------------
-- income — as receitas do usuário: o dinheiro que entrou.
-- SEM CATEGORIA, de propósito: gasto se pergunta "em quê?" (e a resposta é uma
-- árvore inteira, com dezenas de linhas por mês); receita se pergunta "de
-- onde?", e a resposta cabe no nome — salário, freela, aluguel. Classificar três
-- linhas por mês numa hierarquia é fricção sem retorno (regra 6).
-- DUAS DATAS, e as duas aparecem na tela: `received_at` (quando o dinheiro
-- entrou, editável, ordena a lista) e `created_at` (quando a linha foi criada).
-- Em `expense` a segunda fica só no banco; aqui ela é LIDA.
-- Dinheiro é `numeric(12,2)` e quem converte para reais é a trigger
-- income_guard() — o cliente não tem grant em amount_brl. Excluir é
-- SOFT-DELETE. Ver functions.sql (income_guard, income_remove).
-- -------------------------------------------------------------------------
create table if not exists public.income (
  id         int generated always as identity primary key,
  -- Dona. O DEFAULT é o que permite o front inserir sem mencionar o profile_id —
  -- ele não tem grant nesta coluna, então não pode forjar o dono.
  profile_id int not null default public.current_profile_id()
             references public.profile (id) on delete cascade,
  -- De onde veio o dinheiro ("salário", "freela do site"). É o ÚNICO descritor:
  -- sem categoria, este campo carrega sozinho o que a hierarquia carrega no gasto.
  name       text not null,
  -- Valor na moeda de `currency`. US$ 500,00 = 500.00. numeric, nunca float: em
  -- ponto flutuante 0.1 + 0.2 não dá 0.3, e o extrato deixa de fechar.
  amount     numeric(12,2) not null,
  -- Mesmo enum de expense, de propósito: gasto e receita falam da mesma moeda, e
  -- um segundo enum faria o Chat ter de escolher qual usar ao ler "recebi 500
  -- dólares".
  currency   public.currency not null default 'BRL',
  -- Taxa de câmbio do MOMENTO do registro: quantos reais vale 1 unidade de
  -- `currency`. Null quando já é BRL. Guardada (e não recalculada na leitura)
  -- porque cotação é fato datado — senão o extrato muda de valor toda manhã.
  exchange_rate numeric(14,6),
  -- O mesmo valor em REAIS. Preenchido SÓ pela trigger.
  amount_brl numeric(12,2) not null default 0,
  -- Quando o dinheiro ENTROU (com hora) — não quando foi registrado: dá para
  -- lançar na segunda o salário que caiu na sexta.
  received_at timestamptz not null default now(),
  -- Hoje só acompanha o deleted_at. Reservada para um "arquivar" futuro.
  is_active  boolean not null default true,
  -- Soft-delete. Preenchida = excluída (a RLS deixa de devolver a linha).
  deleted_at timestamptz,
  -- Quando a receita foi REGISTRADA. Diferente de expense, esta coluna é LIDA
  -- pela tela — e por isso fica fora do grant de escrita (ver grants.sql).
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint income_name_len check (char_length(name) between 1 and 80),
  -- Receita é sempre positiva (negativa seria gasto, que tem tabela própria). O
  -- piso é UM CENTAVO: `> 0` deixaria passar 0.001, arredondado para zero pela
  -- escala. O teto repete o do numeric de propósito — assim a conversão esbarra
  -- numa mensagem traduzível, e não no "numeric field overflow" cru.
  constraint income_amount_range     check (amount     between 0.01 and 9999999.99),
  constraint income_amount_brl_range check (amount_brl between 0.01 and 9999999.99),
  -- A coerência do trio (moeda · cotação · valor em reais) como GARANTIA, e não
  -- só como código da trigger: um UPDATE manual esbarra aqui.
  constraint income_brl_has_no_rate check (
    currency <> 'BRL' or (exchange_rate is null and amount_brl = amount)
  ),
  constraint income_foreign_has_rate check (
    currency = 'BRL' or (exchange_rate is not null and exchange_rate > 0)
  ),
  -- Excluída é sempre inativa — o mesmo invariante de `expense` e `category`.
  constraint income_deleted_is_inactive check (deleted_at is null or is_active = false)
);

comment on table  public.income               is 'Receitas do usuário: o dinheiro que entrou. Sem categoria — o nome basta.';
comment on column public.income.profile_id    is 'Dona. Preenchido pelo DEFAULT current_profile_id() — o cliente não tem grant nesta coluna.';
comment on column public.income.name          is 'De onde veio o dinheiro ("salário", "freela do site"). É o único descritor: receita não tem categoria.';
comment on column public.income.amount        is 'Valor na moeda de currency, numeric(12,2). US$ 500,00 = 500.00. numeric, nunca float: a soma tem de fechar.';
comment on column public.income.currency      is 'Moeda em que a receita entrou. Padrão BRL. Mesmo enum de expense, de propósito.';
comment on column public.income.exchange_rate is 'Taxa de câmbio do momento do registro: quantos reais vale 1 unidade de currency. Null quando currency = BRL.';
comment on column public.income.amount_brl    is 'O mesmo valor em REAIS. Calculado pela trigger — é a coluna que todo total do sistema soma.';
comment on column public.income.received_at   is 'Quando o dinheiro ENTROU (com hora) — não quando foi registrado. Dá para lançar na segunda o salário da sexta.';
comment on column public.income.is_active     is 'Hoje só acompanha o deleted_at (excluída ⇒ inativa). Reservada para um "arquivar" futuro.';
comment on column public.income.deleted_at    is 'Soft-delete. Preenchida = excluída (a RLS deixa de devolver a linha). Força is_active = false.';
comment on column public.income.created_at    is 'Quando a receita foi REGISTRADA. Diferente de expense, esta coluna é LIDA pela tela.';

-- -------------------------------------------------------------------------
-- public.ai_log — a conversa E a auditoria, numa tabela só
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


-- ############ 4. INDEXES ############
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


-- ############ 5. FUNCTIONS ############
-- -------------------------------------------------------------------------
-- handle_new_user — cria o perfil quando a conta nasce (ou é confirmada).
-- Nunca derruba o cadastro: erro vira warning e o app repara via ensure_profile().
-- -------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null then
    begin
      insert into public.profile (auth_uuid, full_name, email)
      values (
        new.id,
        coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
        coalesce(new.email, '')
      )
      on conflict (auth_uuid) do nothing;
    exception when others then
      raise warning 'handle_new_user falhou para % : %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- handle_user_email_update — espelha auth.users.email em profile.email.
-- auth.users é a fonte da verdade; a cópia anda atrás por aqui e por mais nada.
-- -------------------------------------------------------------------------
create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profile
       set email = coalesce(new.email, '')
     where auth_uuid = new.id;
  end if;
  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- profile_guard_and_touch — colunas somente-leitura para o cliente + updated_at.
-- Bypass quando auth.uid() is null (GoTrue, SQL Editor, service_role).
-- -------------------------------------------------------------------------
create or replace function public.profile_guard_and_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if new.auth_uuid  is distinct from old.auth_uuid
    or new.email      is distinct from old.email
    or new.deleted_at is distinct from old.deleted_at
    or new.created_at is distinct from old.created_at then
      raise exception 'profile_readonly_column'
        using errcode = 'P0001',
              hint = 'email vem de auth.users; deleted_at, auth_uuid e created_at nao sao editaveis pelo cliente.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- current_profile_id — auth.uid() → profile.id. O helper de RLS de TODO módulo.
-- Conta desativada devolve NULL, o que já nega acesso em qualquer policy que
-- compare `profile_id = public.current_profile_id()`.
-- -------------------------------------------------------------------------
create or replace function public.current_profile_id()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select id
    from public.profile
   where auth_uuid = auth.uid()
     and deleted_at is null
$$;

-- -------------------------------------------------------------------------
-- ensure_profile — rede do app para "logado sem perfil". Idempotente.
-- -------------------------------------------------------------------------
create or replace function public.ensure_profile()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  insert into public.profile (auth_uuid, full_name, email)
  select u.id,
         coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), ''),
         coalesce(u.email, '')
    from auth.users u
   where u.id = auth.uid()
  on conflict (auth_uuid) do nothing;

  select id into v_id from public.profile where auth_uuid = auth.uid();
  return v_id;
end;
$$;

-- -------------------------------------------------------------------------
-- email_available — usada SÓ na troca de e-mail (role authenticated).
-- Devolve um booleano e nada mais; não é exposta a `anon` para não virar um
-- endereço público de descoberta de quem tem conta.
-- -------------------------------------------------------------------------
create or replace function public.email_available(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
      from auth.users u
     where lower(u.email) = lower(trim(p_email))
       and u.id <> auth.uid()
  );
$$;

-- --- public.category -----------------------------------------------------

-- -------------------------------------------------------------------------
-- category_guard — a guarda de integridade da árvore (trigger de escrita).
-- Normaliza o que dá para normalizar e recusa o que quebraria a árvore.
--
-- `security definer` porque a função precisa SUBIR pelos ancestrais para caçar
-- ciclo, e essa subida não pode depender da RLS de quem está gravando. A FK
-- composta já garante que todo ancestral é do mesmo perfil, então não há dado de
-- terceiro alcançável por aqui.
create or replace function public.category_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancestral   int;
  v_saltos      int := 0;
  v_mae_e_nova  boolean;
begin
  new.name  := trim(new.name);
  new.color := lower(new.color);
  new.updated_at := now();

  -- EXCLUÍDA É SEMPRE INATIVA. Escrito aqui (e não deixado para quem chama) para
  -- que não exista caminho — RPC, SQL Editor, script futuro — capaz de gravar
  -- uma linha excluída que ainda se diz ativa.
  if new.deleted_at is not null then
    new.is_active := false;
  end if;

  -- `old` só é tocado no ramo de UPDATE, e nunca ao lado de um `or`.
  --
  -- Num trigger de INSERT o `old` não está atribuído, e ler um campo dele
  -- levanta erro. Escrever `tg_op = 'INSERT' or new.parent_id is distinct from
  -- old.parent_id` PARECE seguro por curto-circuito — mas o PostgreSQL não
  -- garante a ordem de avaliação de um `or`, então o segundo lado pode ser
  -- avaliado primeiro e derrubar toda criação de categoria. Duas linhas a mais
  -- aqui trocam essa aposta por uma certeza.
  if tg_op = 'INSERT' then
    v_mae_e_nova := true;
  else
    v_mae_e_nova := new.parent_id is distinct from old.parent_id;
  end if;

  if new.parent_id is not null and v_mae_e_nova then

    -- TODA consulta daqui é presa a `new.profile_id`, e isso é segurança, não
    -- só correção.
    --
    -- Esta função é `security definer`: ela enxerga a tabela inteira, sem RLS. E
    -- triggers disparam ANTES das constraints — então, sem o filtro, alguém que
    -- inserisse uma categoria apontando para o `parent_id` de OUTRA pessoa
    -- receberia 'category_parent_deleted' quando a linha alheia estivesse
    -- excluída, e o erro de chave estrangeira quando não estivesse. Nenhuma
    -- linha seria criada nos dois casos, mas a diferença entre as duas mensagens
    -- já é um bit de informação sobre um id que não é dele — e um id é um
    -- inteiro pequeno, de percorrer em minutos.
    --
    -- Com o filtro, mãe de outro perfil é simplesmente "mãe que não existe", e o
    -- caminho passa a ser sempre o mesmo: a FK composta recusa.
    if exists (
      select 1 from public.category c
       where c.id = new.parent_id
         and c.profile_id = new.profile_id
         and c.deleted_at is not null
    ) then
      raise exception 'category_parent_deleted'
        using errcode = 'P0001',
              hint = 'A categoria mae foi excluida.';
    end if;

    -- MÃE INATIVA ⇒ A FILHA TAMBÉM. Sustenta o invariante de que a subárvore de
    -- uma categoria desativada está inteiramente desativada — é dele que a tela
    -- depende para separar a árvore principal do submenu "Desativadas".
    --
    -- Sem isto, uma filha ativa pendurada numa mãe desativada ficaria fora dos
    -- dois lugares: fora da árvore principal (a mãe não é desenhada) e fora do
    -- submenu (ela se diz ativa). Existiria no banco, sem caminho até ela na tela.
    if exists (
      select 1 from public.category c
       where c.id = new.parent_id
         and c.profile_id = new.profile_id
         and c.is_active = false
    ) then
      new.is_active := false;
    end if;

    -- CICLO. Subimos a partir da mãe pretendida: se em algum degrau chegarmos na
    -- própria linha, a "árvore" viraria um anel — e um anel faz o WITH RECURSIVE
    -- que soma os descendentes girar para sempre.
    v_ancestral := new.parent_id;
    while v_ancestral is not null loop
      if v_ancestral = new.id then
        raise exception 'category_cycle'
          using errcode = 'P0001',
                hint = 'Uma categoria nao pode ser descendente de si mesma.';
      end if;

      -- Rede de segurança: se um ciclo já existisse (criado por um UPDATE manual
      -- antes deste trigger existir), o loop acima não terminaria nunca.
      v_saltos := v_saltos + 1;
      if v_saltos > 100 then
        raise exception 'category_too_deep'
          using errcode = 'P0001',
                hint = 'Hierarquia profunda demais.';
      end if;

      select c.parent_id into v_ancestral
        from public.category c
       where c.id = v_ancestral
         and c.profile_id = new.profile_id;
    end loop;
  end if;

  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- category_subtree — a categoria e todos os seus descendentes vivos.
-- A categoria e todos os seus descendentes vivos. É a base de tudo: da decisão
-- de excluir, da desativação em cascata e, quando o Chat existir, do "quanto
-- gastei com carro esse mês?" (que soma Carro E tudo abaixo dele).
--
-- O filtro por dono está NA RAIZ da recursiva: como a FK é composta, todo
-- descendente de uma categoria minha é necessariamente meu.
create or replace function public.category_subtree(p_category_id int)
returns table (id int)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive arvore as (
    select c.id
      from public.category c
     where c.id = p_category_id
       and c.profile_id = public.current_profile_id()
       and c.deleted_at is null
    union all
    select f.id
      from public.category f
      join arvore a on f.parent_id = a.id
     where f.deleted_at is null
  )
  select arvore.id from arvore;
$$;

-- -------------------------------------------------------------------------
-- category_linked_records — quantos lançamentos apontam para estas categorias.
--
-- É o que decide, junto com o número de descendentes, se uma categoria pode ser
-- EXCLUÍDA ou só DESATIVADA. Uma categoria com gasto vinculado nunca é excluída:
-- o histórico financeiro não pode ficar apontando para o vazio.
--
-- SÓ GASTOS ENTRAM NESTA CONTA, e assim fica: a migration de Receitas
-- (20260826170132) decidiu que `income` NÃO tem categoria — receita se pergunta
-- "de onde?", e a resposta cabe no nome. Sem `category_id` na `income` não
-- existe vínculo a contar, e somar zero seria um JOIN a mais em toda exclusão de
-- categoria. (A migration de Gastos previa o contrário; o comentário de lá é
-- histórico e não se edita — forward-only.)
--
-- `deleted_at is null` no filtro: um gasto EXCLUÍDO não é vínculo. Se contasse,
-- uma categoria usada uma única vez, num gasto já apagado, nunca mais poderia
-- ser excluída — presa por um registro que ninguém mais enxerga.
--
-- Não filtra por perfil de propósito: os ids que ela recebe vêm sempre de
-- `category_subtree`, que já os limitou ao perfil de quem chamou. Mantenha essa
-- premissa — nunca chame esta função com ids que não tenham passado por lá.
create or replace function public.category_linked_records(p_category_ids int[])
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*)
      from public.expense e
     where e.category_id = any (p_category_ids)
       and e.deleted_at is null
  )::int;
$$;

-- -------------------------------------------------------------------------
-- category_action_for — "exclui ou desativa?", numa função só.
-- "Exclui ou desativa?", numa função só.
--
-- Ela é minúscula e existe por um motivo: a regra é consultada em DOIS momentos
-- distintos — quando a tela pergunta o que vai acontecer (para escrever a frase
-- da modal) e quando o banco de fato age. Escrita duas vezes, um dia as duas
-- divergem, e a modal passa a prometer uma coisa enquanto o banco faz outra.
create or replace function public.category_action_for(p_descendants int, p_records int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_descendants = 0 and p_records = 0 then 'delete' else 'deactivate' end;
$$;

-- -------------------------------------------------------------------------
-- category_impact — a prévia que alimenta a modal de confirmação.
-- O que ACONTECERIA se a categoria fosse excluída agora. A tela chama isto ao
-- abrir a confirmação, para dizer a verdade em vez de um texto genérico:
-- "3 subcategorias vão junto para Desativadas" é uma frase diferente de
-- "esta categoria será excluída".
--
-- É só uma PRÉVIA: quem decide de fato é category_remove, ao agir.
create or replace function public.category_impact(p_category_id int)
returns table (descendants int, records int, action text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids int[];
begin
  select array_agg(s.id) into v_ids from public.category_subtree(p_category_id) s;

  -- Vazio = a categoria não existe OU não é deste perfil. A mensagem é a mesma
  -- nos dois casos, de propósito: distinguir "não existe" de "não é sua"
  -- confirmaria a existência de um id alheio.
  if v_ids is null then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;

  descendants := array_length(v_ids, 1) - 1;  -- a própria categoria não conta
  records     := public.category_linked_records(v_ids);
  action      := public.category_action_for(descendants, records);
  return next;
end;
$$;

-- -------------------------------------------------------------------------
-- category_remove — excluir (soft-delete) ou, quando não dá, desativar.
-- Excluir a categoria — ou desativá-la, quando excluir não é possível.
--
-- Devolve o que REALMENTE aconteceu ('deleted' | 'deactivated'), e é esse
-- retorno que a tela usa para o aviso final. Nunca o que a prévia tinha dito: se
-- um gasto for lançado nessa categoria entre a abertura da modal e o clique de
-- confirmar, o certo é desativar, e é isso que a pessoa vai ler na tela.
create or replace function public.category_remove(p_category_id int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil  int := public.current_profile_id();
  v_ids     int[];
  v_records int;
begin
  select array_agg(s.id) into v_ids from public.category_subtree(p_category_id) s;
  if v_ids is null then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;

  v_records := public.category_linked_records(v_ids);

  if public.category_action_for(array_length(v_ids, 1) - 1, v_records) = 'delete' then
    -- Nada pendurado: pode ir. Soft-delete — a linha some da RLS, e o
    -- `is_active = false` é aplicado pelo trigger.
    update public.category
       set deleted_at = now()
     where id = p_category_id
       and profile_id = v_perfil;
    return 'deleted';
  end if;

  -- Tem algo pendurado: DESATIVA a subárvore inteira.
  --
  -- A subárvore inteira, e não só a mãe: uma mãe inativa com filhas ativas
  -- deixaria as filhas sem caminho até elas na tela — presentes no banco,
  -- invisíveis para quem usa. Some tudo junto, e volta tudo junto (category_reactivate).
  update public.category
     set is_active = false
   where id = any (v_ids)
     and profile_id = v_perfil;

  return 'deactivated';
end;
$$;

-- -------------------------------------------------------------------------
-- category_reactivate — o caminho de volta do submenu "Desativadas".
-- Reativar uma categoria desativada. O caminho de volta do submenu.
--
-- Mexe em DOIS sentidos, e os dois são necessários:
--   • PARA BAIXO — a subárvore inteira, porque foi assim que ela saiu (category_remove);
--   • PARA CIMA  — a cadeia de mães, porque uma categoria ativa pendurada numa
--     mãe inativa continuaria invisível na árvore. Reativar sem subir devolveria
--     à pessoa uma categoria que "voltou" e que ela não consegue encontrar.
create or replace function public.category_reactivate(p_category_id int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil int := public.current_profile_id();
begin
  if not exists (
    select 1 from public.category c
     where c.id = p_category_id
       and c.profile_id = v_perfil
       and c.deleted_at is null
  ) then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;

  with recursive maes as (
    select c.id, c.parent_id
      from public.category c
     where c.id = p_category_id
    union all
    select m.id, m.parent_id
      from public.category m
      join maes on m.id = maes.parent_id
  )
  update public.category alvo
     set is_active = true
   where alvo.profile_id = v_perfil
     and alvo.deleted_at is null
     and (alvo.id in (select maes.id from maes)
       or alvo.id in (select s.id from public.category_subtree(p_category_id) s));
end;
$$;

-- -------------------------------------------------------------------------
-- expense_guard — a guarda de escrita do gasto (trigger). É AQUI que a
-- conversão para reais acontece: o cliente manda valor, moeda e cotação, e
-- quem calcula `amount_brl` é o banco.
-- -------------------------------------------------------------------------
-- Normaliza o nome, sustenta "excluído é sempre inativo", confere a categoria e,
-- o principal, CALCULA O VALOR EM REAIS.
--
-- O cálculo mora aqui, e não no front-end, porque `amount_brl` é a coluna
-- que todos os totais somam. Se o cliente a enviasse, bastaria uma versão antiga
-- do app, uma chamada direta à API REST ou um bug de arredondamento para o
-- extrato passar a mentir — e mentir de um jeito invisível, porque cada linha
-- continuaria parecendo perfeitamente normal.
--
-- `security definer` porque ela precisa CONSULTAR a `category` para conferir o
-- dono, e essa consulta não pode depender da RLS de quem está gravando.
create or replace function public.expense_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brl numeric;
begin
  new.name       := trim(new.name);
  new.updated_at := now();

  -- EXCLUÍDO É SEMPRE INATIVO. Escrito aqui (e não deixado para quem chama) para
  -- que não exista caminho — RPC, SQL Editor, script futuro — capaz de gravar
  -- uma linha excluída que ainda se diz ativa.
  if new.deleted_at is not null then
    new.is_active := false;
  end if;

  -- --- A conversão ------------------------------------------------------
  if new.currency = 'BRL' then
    -- Já é real: não há cotação a guardar, e o valor em reais é o próprio valor.
    -- Zeramos a cotação em vez de recusar quem a mandou — um cliente que troca
    -- de USD para BRL no formulário não precisa saber que tem de limpar o campo.
    new.exchange_rate := null;
    new.amount_brl    := new.amount;
  else
    if new.exchange_rate is null or new.exchange_rate <= 0 then
      raise exception 'expense_rate_required'
        using errcode = 'P0001',
              hint = 'Gasto em moeda estrangeira exige a cotacao.';
    end if;

    -- `round(x, 2)` explícito, e não deixado para a escala da coluna: o produto
    -- de um valor de 2 casas por uma cotação de 6 tem 8 casas decimais, e é aqui
    -- que ele vira centavo — meio centavo sobe.
    --
    -- O teste de faixa vem ANTES de a linha chegar na coluna. É o que transforma
    -- o "numeric field overflow" cru do Postgres numa mensagem que a tela sabe
    -- traduzir: US$ 5.000.000 a 5,16 passa de 9.999.999,99 e o certo é dizer
    -- isso, não estourar.
    v_brl := round(new.amount * new.exchange_rate, 2);

    if v_brl < 0.01 or v_brl > 9999999.99 then
      raise exception 'expense_amount_out_of_range'
        using errcode = 'P0001',
              hint = 'O valor convertido nao cabe no limite da coluna.';
    end if;

    new.amount_brl := v_brl;
  end if;

  -- --- A categoria ------------------------------------------------------
  -- A FK composta já impede pendurar o gasto numa categoria de outro perfil.
  -- O que ela NÃO vê é a categoria EXCLUÍDA (soft-delete): a linha continua lá,
  -- então a FK a aceita de bom grado, e o gasto nasceria dentro de uma gaveta
  -- que sumiu da tela — invisível na lista por categoria, mas somando no total.
  --
  -- O filtro por `new.profile_id` é segurança, não só correção: esta função é
  -- `security definer` e enxerga a tabela inteira. Sem ele, um id de categoria
  -- alheia devolveria 'expense_category_not_found' num caso e o erro de chave
  -- estrangeira no outro — e a diferença entre as duas mensagens já é um bit de
  -- informação sobre um id que não é do usuário. Com o filtro, categoria de
  -- outra pessoa é simplesmente "categoria que não existe".
  if new.category_id is not null then
    if not exists (
      select 1 from public.category c
       where c.id = new.category_id
         and c.profile_id = new.profile_id
         and c.deleted_at is null
    ) then
      raise exception 'expense_category_not_found'
        using errcode = 'P0001',
              hint = 'A categoria nao existe (ou foi excluida).';
    end if;
  end if;

  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- expense_remove — excluir um gasto (soft-delete). A única porta de saída.
-- -------------------------------------------------------------------------
-- Excluir um gasto é SOFT-DELETE: `deleted_at` preenchido, `is_active` a false
-- pela trigger, e a linha some da RLS.
--
-- É uma RPC, e não um `update` do cliente, porque o cliente NÃO TEM GRANT em
-- `deleted_at` (seção 7) — de propósito. Com grant, um `update` pela API REST
-- poderia tanto excluir quanto RESSUSCITAR um gasto zerando a coluna, e a
-- "exclusão" viraria uma sugestão. Aqui a porta é uma só, e ela abre num
-- sentido.
--
-- Diferente de `category_remove`, não há decisão a tomar: nada é pendurado num
-- gasto, então excluir sempre exclui.
create or replace function public.expense_remove(p_expense_id int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil int := public.current_profile_id();
begin
  update public.expense
     set deleted_at = now()
   where id = p_expense_id
     and profile_id = v_perfil
     and deleted_at is null;

  -- Nenhuma linha tocada = o gasto não existe, já foi excluído OU é de outra
  -- pessoa. A mensagem é a mesma nos três casos, de propósito: distinguir "não
  -- existe" de "não é seu" confirmaria a existência de um id alheio.
  if not found then
    raise exception 'expense_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- --- public.income --------------------------------------------------------

-- -------------------------------------------------------------------------
-- income_guard — a guarda de escrita da receita. É aqui que a CONVERSÃO
-- acontece: o cliente manda valor, moeda e cotação, e esta função calcula os
-- reais. O cálculo não mora no front-end porque `amount_brl` é a coluna que
-- todos os totais somam — bastaria uma aba antiga aberta ou uma chamada direta
-- à API REST para o extrato passar a mentir de um jeito invisível.
--
-- Ao contrário de `expense_guard`, NÃO consulta nenhuma outra tabela: sem
-- categoria, não há dono a conferir além do que a RLS já garante. Continua
-- `security definer` com search_path fixo por higiene — uma trigger não deve
-- depender do search_path de quem disparou a escrita.
-- -------------------------------------------------------------------------
create or replace function public.income_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brl numeric;
begin
  new.name       := trim(new.name);
  new.updated_at := now();

  -- Excluída é sempre inativa. Escrito aqui (e não deixado para quem chama) para
  -- que não exista caminho — RPC, SQL Editor, script futuro — capaz de gravar
  -- uma linha excluída que ainda se diz ativa.
  if new.deleted_at is not null then
    new.is_active := false;
  end if;

  if new.currency = 'BRL' then
    -- Já é real: não há cotação a guardar. Zeramos em vez de recusar quem a
    -- mandou — trocar de USD para BRL no formulário não pode exigir que a tela
    -- saiba limpar o campo.
    new.exchange_rate := null;
    new.amount_brl    := new.amount;
  else
    if new.exchange_rate is null or new.exchange_rate <= 0 then
      raise exception 'income_rate_required'
        using errcode = 'P0001',
              hint = 'Receita em moeda estrangeira exige a cotacao.';
    end if;

    -- `round(x, 2)` explícito: o produto de um valor de 2 casas por uma cotação
    -- de 6 tem 8 casas decimais, e é aqui que ele vira centavo. O teste de faixa
    -- vem ANTES de a linha chegar na coluna — é o que troca o "numeric field
    -- overflow" cru por uma mensagem que a tela sabe traduzir.
    v_brl := round(new.amount * new.exchange_rate, 2);

    if v_brl < 0.01 or v_brl > 9999999.99 then
      raise exception 'income_amount_out_of_range'
        using errcode = 'P0001',
              hint = 'O valor convertido nao cabe no limite da coluna.';
    end if;

    new.amount_brl := v_brl;
  end if;

  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- income_remove — o soft-delete da receita.
--
-- É uma RPC, e não um `update` do cliente, porque o cliente não tem grant em
-- `deleted_at`: com grant, o mesmo update que exclui poderia RESSUSCITAR a
-- receita zerando a coluna, e a exclusão viraria uma sugestão.
--
-- Como em `expense_remove`, não há decisão a tomar: nada se pendura numa
-- receita, então excluir sempre exclui.
-- -------------------------------------------------------------------------
create or replace function public.income_remove(p_income_id int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil int := public.current_profile_id();
begin
  update public.income
     set deleted_at = now()
   where id = p_income_id
     and profile_id = v_perfil
     and deleted_at is null;

  -- Nenhuma linha tocada = não existe, já foi excluída OU é de outra pessoa. A
  -- mensagem é a mesma nos três casos, de propósito: distinguir "não existe" de
  -- "não é sua" confirmaria a existência de um id alheio.
  if not found then
    raise exception 'income_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- --- public.ai_log e as RPCs do Chat -------------------------------------

-- -------------------------------------------------------------------------
-- ai_log_add_turn — grava o turno inteiro, ou nada
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
   -- Null = sem limite deste lado, para o Chat poder perguntar "o último gasto,
   -- seja de quando for". Com as datas, o recorte segue fechado no início e
   -- aberto no fim, como no resto do sistema.
   where (p_from is null or e.occurred_at >= p_from)
     and (p_to   is null or e.occurred_at <  p_to)
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

-- ############ 6. TRIGGERS ############
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

-- ############ 7. VIEWS ############
-- (nenhuma)

-- ############ 8. RLS + POLICIES ############
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


-- ############ 9. GRANTS ############
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

-- ############ 10. REALTIME ############
-- (nada publicado no realtime)

-- ############ 11. STORAGE ############
-- -------------------------------------------------------------------------
-- avatars — a foto de perfil.
--
-- LEITURA pública: a foto aparece no menu do usuário em toda tela, e um bucket
-- privado exigiria assinar uma URL temporária a cada montagem. A pasta é o
-- `auth_uuid` justamente por isso: uuid não se adivinha, enquanto uma pasta
-- numerada (1/, 2/, 3/…) se percorreria em minutos.
--
-- ESCRITA presa à própria pasta, pela policy abaixo.
--
-- Limite de tamanho e lista de mimes ficam no BUCKET, não só no front: validação
-- de cliente é conveniência, não segurança.
-- -------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- `for all` cobre insert/select/update/delete — inclusive o delete, que é o que
-- o botão "Remover foto" usa.
drop policy if exists avatar_own_folder on storage.objects;
create policy avatar_own_folder on storage.objects
  for all to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ############ 12. SEEDS ############
-- (nenhum)

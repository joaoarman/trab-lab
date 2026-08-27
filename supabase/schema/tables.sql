-- =========================================================================
-- tables.sql
-- CREATE TABLE de cada tabela (estado final — sem ALTER).
-- Estado ATUAL do banco para esta entidade.
-- =========================================================================

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

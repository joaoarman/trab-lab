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

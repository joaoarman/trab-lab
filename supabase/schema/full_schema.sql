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
-- `income` entra aqui do mesmo jeito quando o módulo de Receitas for feito:
--     + (select count(*) from public.income i
--         where i.category_id = any (p_category_ids) and i.deleted_at is null)
-- e mais nada — nem no banco, nem na tela, nem nos textos da modal.
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

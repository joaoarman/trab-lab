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

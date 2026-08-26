-- =========================================================================
-- 20260825184944_auth-perfil-e-avatar.sql
--
-- O Auth do Self OS: a tabela de perfil, a ligação com o Supabase Auth, o
-- espelho do e-mail, o bucket do avatar e a RLS por dono.
--
-- MODELO DE ACESSO: B2C por usuário. Todo dado do sistema
-- é de UM perfil, e cada pessoa só enxerga o que é seu. Quem garante isso é a
-- RLS daqui — o front-end NÃO escreve o filtro por dono nas queries.
--
-- ESCOLHAS DESTE PROJETO (ver PENDENCIAS.md):
--   • Confirmação de e-mail DESLIGADA — a conta nasce confirmada e o sistema
--     não envia e-mail nenhum. Não há recuperação de senha.
--   • E-mail ESPELHADO em profile.email, mantido só por trigger; a fonte da
--     verdade continua sendo auth.users.
--   • Avatar em bucket público, com a pasta nomeada pelo auth_uuid.
--
-- Copiar e colar no SQL Editor do Supabase.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. Tabela de perfil
-- -------------------------------------------------------------------------
-- A ponte entre o autenticador e o sistema. `auth_uuid` liga em auth.users;
-- todo o RESTO do sistema (gasto, receita, categoria, mensagem do chat, log da
-- IA) vai referenciar o `id` inteiro daqui, nunca o uuid.
create table if not exists public.profile (
  id          int generated always as identity primary key,

  -- A ligação com o Supabase Auth. `on delete cascade` existe por completude do
  -- modelo: o sistema NUNCA apaga de auth.users (desativar é preencher
  -- deleted_at) — apagar cascatearia o perfil e levaria junto o histórico
  -- financeiro da pessoa.
  auth_uuid   uuid not null unique references auth.users (id) on delete cascade,

  full_name   text not null default '',

  -- E-MAIL ESPELHADO — cópia de leitura, escrita SÓ pelo trigger de sync.
  -- A fonte da verdade é auth.users.email. O cliente não tem grant nesta
  -- coluna e o trigger-guarda recusa a alteração (ver seção 4).
  email       text not null default '',

  -- CAMINHO do objeto no bucket `avatars` (ex.: '<auth_uuid>/avatar.jpg'),
  -- NÃO uma URL. Guardar a URL pronta assaria o endereço do projeto Supabase
  -- dentro dos dados: trocar de instância (ou de país) quebraria toda foto
  -- salva. O front monta a URL pública a partir daqui.
  avatar_path text,

  -- SOFT-DELETE. Null = conta ativa. Ainda não há tela de exclusão no app, mas
  -- a coluna entra desde já: é o que permite desativar uma conta pelo SQL
  -- Editor, e o `current_profile_id()` abaixo já a respeita — então toda tabela
  -- futura nasce negando acesso a conta desativada, de graça.
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
-- 2. Criação do perfil ao nascer a conta
-- -------------------------------------------------------------------------
-- Roda com os privilégios do dono (security definer) porque a tabela tem RLS e
-- nem existe policy de INSERT: perfil não é criado pelo cliente, é criado aqui.
--
-- `coalesce` em toda coluna + `on conflict do nothing` + captura de exceção:
-- este trigger roda DENTRO da transação de cadastro do GoTrue, então um erro
-- aqui derruba o cadastro inteiro com um "Database error saving new user"
-- ilegível. Preferimos deixar a conta nascer sem perfil e o app repará-la (ver
-- `ensure_profile`) a impedir a pessoa de se cadastrar.
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

-- O caminho REAL neste projeto: com a confirmação desligada, a conta já nasce
-- com email_confirmed_at preenchido, no próprio INSERT.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A rede para o dia em que a confirmação de e-mail for LIGADA: aí a conta nasce
-- sem confirmar e o perfil só deve existir depois que a pessoa confirmar.
-- Deixar os dois triggers prontos evita ter que lembrar deste detalhe depois.
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_new_user();


-- -------------------------------------------------------------------------
-- 3. Espelho do e-mail
-- -------------------------------------------------------------------------
-- auth.users é a fonte da verdade; a cópia em profile.email anda atrás dela por
-- este trigger, e por mais nada. Roda na conexão do GoTrue (onde auth.uid() é
-- nulo), então passa pelo trigger-guarda da seção 4.
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

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_update();


-- -------------------------------------------------------------------------
-- 4. Colunas somente-leitura para o cliente + updated_at
-- -------------------------------------------------------------------------
-- Defesa em profundidade. O grant de coluna (seção 7) já libera UPDATE só em
-- full_name e avatar_path, então este trigger não deveria disparar nunca — ele
-- existe justamente para o caso de alguém afrouxar o grant sem perceber.
--
-- O bypass é `auth.uid() is null`: nessa condição quem escreve é o GoTrue (sync
-- do e-mail) ou o SQL Editor/service_role — não uma pessoa pelo app.
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

drop trigger if exists on_profile_before_update on public.profile;
create trigger on_profile_before_update
  before update on public.profile
  for each row execute function public.profile_guard_and_touch();


-- -------------------------------------------------------------------------
-- 5. Helper de RLS — auth.uid() → id do perfil
-- -------------------------------------------------------------------------
-- A função que TODA tabela futura vai usar na policy:
--     using (profile_id = public.current_profile_id())
--
-- Repare no `deleted_at is null`: uma conta desativada devolve NULL aqui, e
-- `profile_id = null` é falso para toda linha. Ou seja, desativar a conta já
-- fecha o acesso a gastos, receitas, categorias e chat sem escrever uma linha
-- de policy a mais em cada tabela.
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
-- 6. RPCs da conta
-- -------------------------------------------------------------------------

-- Rede de segurança do app: se por qualquer motivo a pessoa está logada e não
-- tem perfil (ver o `exception` da seção 2), o app chama isto e o perfil nasce.
-- Idempotente — chamar de novo não duplica nem estoura.
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

-- Usada na TROCA DE E-MAIL, antes de aplicar: se o endereço já é de outra
-- conta, a tela avisa em vez de deixar o usuário bater num erro cru.
--
-- Devolve um BOOLEANO e nada mais. É o mínimo possível: a função lê auth.users
-- furando a RLS, então quanto menos ela contar, menor o estrago se um dia o
-- grant escapar. E o grant é só para `authenticated` — de propósito.
--
-- No CADASTRO esta função NÃO é usada. Com a confirmação desligada, o próprio
-- signUp já devolve "user_already_exists", e o front mapeia esse erro. Expor a
-- checagem ao `anon` criaria um endereço público para descobrir quem tem conta
-- no sistema — e, sem CAPTCHA, nada impediria raspar isso em lista.
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


-- -------------------------------------------------------------------------
-- 7. RLS, policies e grants
-- -------------------------------------------------------------------------
alter table public.profile enable row level security;

-- Cada pessoa lê e altera SÓ a própria linha.
-- Sem policy de INSERT (quem cria o perfil é o trigger) e sem DELETE (não há
-- exclusão de linha: a saída é o soft-delete via deleted_at).
drop policy if exists profile_select_own on public.profile;
create policy profile_select_own on public.profile
  for select to authenticated
  using (auth.uid() = auth_uuid);

drop policy if exists profile_update_own on public.profile;
create policy profile_update_own on public.profile
  for update to authenticated
  using (auth.uid() = auth_uuid)
  with check (auth.uid() = auth_uuid);

-- Menor privilégio. A RLS diz QUAIS LINHAS; o grant de coluna diz QUAIS
-- COLUNAS — são coisas diferentes, e sem o segundo o dono da linha poderia
-- reescrever o próprio e-mail espelhado ou "reviver" a conta zerando deleted_at.
revoke all on public.profile from anon, authenticated;
grant select on public.profile to authenticated;
grant update (full_name, avatar_path) on public.profile to authenticated;

-- Funções: nada aberto ao público; cada uma só para quem precisa.
revoke execute on function public.handle_new_user()             from public, anon, authenticated;
revoke execute on function public.handle_user_email_update()    from public, anon, authenticated;
revoke execute on function public.profile_guard_and_touch()     from public, anon, authenticated;

revoke execute on function public.current_profile_id()          from public, anon;
grant  execute on function public.current_profile_id()          to authenticated;

revoke execute on function public.ensure_profile()              from public, anon;
grant  execute on function public.ensure_profile()              to authenticated;

revoke execute on function public.email_available(text)         from public, anon;
grant  execute on function public.email_available(text)         to authenticated;


-- -------------------------------------------------------------------------
-- 8. Storage — o bucket do avatar
-- -------------------------------------------------------------------------
-- Bucket PÚBLICO para leitura: a foto aparece no menu do usuário em toda tela,
-- e um bucket privado exigiria assinar uma URL temporária a cada montagem, que
-- expira e precisa ser renovada. O preço disso é que quem souber o caminho vê a
-- foto — por isso a pasta é o `auth_uuid` e não o `id` do perfil: uuid não se
-- adivinha, enquanto `1/avatar.jpg`, `2/avatar.jpg`… se percorreria em minutos.
--
-- ESCRITA é outra história: as policies abaixo prendem cada um à própria pasta.
--
-- O limite de 2 MB e a lista de mimes ficam no BUCKET, não só no front: validação
-- de cliente é conveniência, não segurança — quem chamar a API direto passa por
-- fora dela.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Enviar, substituir, listar e apagar: só dentro da pasta cujo nome é o próprio
-- auth.uid(). `for all` cobre insert/select/update/delete de uma vez — inclusive
-- o delete, que é o que o botão "Remover foto" usa.
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

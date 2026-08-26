-- =========================================================================
-- functions.sql
-- Functions.
-- Estado ATUAL do banco para esta entidade.
-- =========================================================================

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

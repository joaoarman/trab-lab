-- 20260826105604_gastos.sql
--
-- Gastos: o enum `currency`, a tabela `expense`, a RLS por dono, a guarda que
-- converte o valor para reais e a regra de exclusão.
--
-- Copiar e colar no SQL Editor do Supabase.

-- 1. O enum da moeda
do $$
begin
  if to_regtype('public.currency') is null then
    create type public.currency as enum ('BRL', 'USD');
  end if;
end
$$;

comment on type public.currency is 'Moedas aceitas em um lançamento. BRL é o padrão; USD é convertido para reais na gravação.';


-- 2. Tabela
create table if not exists public.expense (
  id         int generated always as identity primary key,

  profile_id int not null default public.current_profile_id()
             references public.profile (id) on delete cascade,

  category_id int,

  name       text not null,

  amount     numeric(12,2) not null,

  currency   public.currency not null default 'BRL',

  exchange_rate numeric(14,6),

  amount_brl numeric(12,2) not null default 0,

  occurred_at timestamptz not null default now(),

  is_active  boolean not null default true,

  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expense_name_len check (char_length(name) between 1 and 80),

  constraint expense_amount_range     check (amount     between 0.01 and 9999999.99),
  constraint expense_amount_brl_range check (amount_brl between 0.01 and 9999999.99),

  constraint expense_brl_has_no_rate check (
    currency <> 'BRL' or (exchange_rate is null and amount_brl = amount)
  ),
  constraint expense_foreign_has_rate check (
    currency = 'BRL' or (exchange_rate is not null and exchange_rate > 0)
  ),

  constraint expense_deleted_is_inactive check (deleted_at is null or is_active = false),

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


-- 3. Índices
create index if not exists expense_profile_occurred_idx
  on public.expense (profile_id, occurred_at desc)
  where deleted_at is null;

create index if not exists expense_category_idx
  on public.expense (category_id)
  where deleted_at is null;


-- 4. A guarda de escrita (trigger) — é aqui que a conversão acontece
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

  if new.deleted_at is not null then
    new.is_active := false;
  end if;

  if new.currency = 'BRL' then
    new.exchange_rate := null;
    new.amount_brl    := new.amount;
  else
    if new.exchange_rate is null or new.exchange_rate <= 0 then
      raise exception 'expense_rate_required'
        using errcode = 'P0001',
              hint = 'Gasto em moeda estrangeira exige a cotacao.';
    end if;

    v_brl := round(new.amount * new.exchange_rate, 2);

    if v_brl < 0.01 or v_brl > 9999999.99 then
      raise exception 'expense_amount_out_of_range'
        using errcode = 'P0001',
              hint = 'O valor convertido nao cabe no limite da coluna.';
    end if;

    new.amount_brl := v_brl;
  end if;

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

drop trigger if exists on_expense_before_write on public.expense;
create trigger on_expense_before_write
  before insert or update on public.expense
  for each row execute function public.expense_guard();


-- 5. A remoção
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

  if not found then
    raise exception 'expense_not_found' using errcode = 'P0001';
  end if;
end;
$$;


-- 6. RLS + policies
alter table public.expense enable row level security;

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


-- 7. Grants (menor privilégio)
revoke all on public.expense from anon, authenticated;
grant select on public.expense to authenticated;
grant insert (name, amount, currency, exchange_rate, category_id, occurred_at)
      on public.expense to authenticated;
grant update (name, amount, currency, exchange_rate, category_id, occurred_at)
      on public.expense to authenticated;

revoke execute on function public.expense_guard() from public, anon, authenticated;

revoke execute on function public.expense_remove(int) from public, anon;
grant  execute on function public.expense_remove(int) to authenticated;


-- 8. O encaixe no módulo de Categorias
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

revoke execute on function public.category_linked_records(int[]) from public, anon, authenticated;

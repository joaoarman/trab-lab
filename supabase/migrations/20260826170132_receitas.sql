-- 20260826170132_receitas.sql
--
-- Receitas: a tabela `income`, a RLS por dono, a guarda que converte o valor para
-- reais e a regra de exclusão. Espelho de `expense`, sem categoria.
--
-- Copiar e colar no SQL Editor do Supabase.

-- 1. Tabela
create table if not exists public.income (
  id         int generated always as identity primary key,

  profile_id int not null default public.current_profile_id()
             references public.profile (id) on delete cascade,

  name       text not null,

  amount     numeric(12,2) not null,

  currency   public.currency not null default 'BRL',

  exchange_rate numeric(14,6),

  amount_brl numeric(12,2) not null default 0,

  received_at timestamptz not null default now(),

  is_active  boolean not null default true,

  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint income_name_len check (char_length(name) between 1 and 80),

  constraint income_amount_range     check (amount     between 0.01 and 9999999.99),
  constraint income_amount_brl_range check (amount_brl between 0.01 and 9999999.99),

  constraint income_brl_has_no_rate check (
    currency <> 'BRL' or (exchange_rate is null and amount_brl = amount)
  ),
  constraint income_foreign_has_rate check (
    currency = 'BRL' or (exchange_rate is not null and exchange_rate > 0)
  ),

  constraint income_deleted_is_inactive check (deleted_at is null or is_active = false)
);

comment on table  public.income               is 'Receitas do usuário: o dinheiro que entrou. Sem categoria — o nome basta (ver a migration).';
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


-- 2. Índice
create index if not exists income_profile_received_idx
  on public.income (profile_id, received_at desc)
  where deleted_at is null;


-- 3. A guarda de escrita (trigger) — é aqui que a conversão acontece
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

  if new.deleted_at is not null then
    new.is_active := false;
  end if;

  if new.currency = 'BRL' then
    new.exchange_rate := null;
    new.amount_brl    := new.amount;
  else
    if new.exchange_rate is null or new.exchange_rate <= 0 then
      raise exception 'income_rate_required'
        using errcode = 'P0001',
              hint = 'Receita em moeda estrangeira exige a cotacao.';
    end if;

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

drop trigger if exists on_income_before_write on public.income;
create trigger on_income_before_write
  before insert or update on public.income
  for each row execute function public.income_guard();


-- 4. A remoção
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

  if not found then
    raise exception 'income_not_found' using errcode = 'P0001';
  end if;
end;
$$;


-- 5. RLS + policies
alter table public.income enable row level security;

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


-- 6. Grants (menor privilégio)
revoke all on public.income from anon, authenticated;
grant select on public.income to authenticated;
grant insert (name, amount, currency, exchange_rate, received_at)
      on public.income to authenticated;
grant update (name, amount, currency, exchange_rate, received_at)
      on public.income to authenticated;

revoke execute on function public.income_guard() from public, anon, authenticated;

revoke execute on function public.income_remove(int) from public, anon;
grant  execute on function public.income_remove(int) to authenticated;


-- 7. O que esta migration NÃO faz — e por quê

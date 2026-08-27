-- 20260827102122_consulta-sem-periodo.sql
--
-- `expense_report` e `income_report` passam a aceitar período nulo, para a IA
-- poder responder "qual foi o último gasto que eu registrei?".
--
-- Copiar e colar no SQL Editor do Supabase.

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

   where (p_from is null or e.occurred_at >= p_from)
     and (p_to   is null or e.occurred_at <  p_to)
     and (case
            when p_uncategorized then e.category_id is null
            when p_category_ids is null then true
            else e.category_id = any (p_category_ids)
          end)
     and (p_search is null or e.name ilike '%' || p_search || '%');
$$;

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

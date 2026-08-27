-- =============================================================================
-- CONSULTA SEM PERÍODO — "qual foi o último gasto que eu registrei?"
--
-- ## O que estava errado
--
-- `expense_report` e `income_report` nasceram com o período OBRIGATÓRIO, porque
-- toda tela que as chama tem um filtro de período em cima (Gastos, Receitas, Log
-- da IA). Faz sentido para uma tela: ali o recorte sempre existe, nem que seja
-- "este mês".
--
-- Na conversa não é assim. "Qual foi o último gasto que eu registrei?" não tem
-- recorte nenhum — e não é uma pergunta esquisita, é das mais naturais que se faz
-- a um assistente. Sem um jeito de perguntar "o mais recente, seja de quando
-- for", a IA precisava INVENTAR um período para poder consultar. E quando ela não
-- inventava, respondia com o que tinha à mão: o histórico da conversa. Foi o que
-- aconteceu — "não há registro de gastos anteriores nesta conversa", com o banco
-- cheio de gastos.
--
-- ## A mudança
--
-- `p_from` e `p_to` passam a aceitar NULL, com o significado óbvio: **sem limite
-- daquele lado**. Os dois nulos = a série inteira.
--
-- É uma extensão pura, não uma quebra: `p_from is null or ...` só acrescenta um
-- caso ao que já existia, e toda chamada que passa as duas datas continua se
-- comportando exatamente como antes. As telas não precisam mudar nada.
--
-- ## Por que não bastava mandar uma data bem antiga da Edge Function
--
-- Porque "1970-01-01" é um período, e um período é uma afirmação: ela apareceria
-- no log de auditoria como se a IA tivesse decidido consultar desde 1970. O nulo
-- diz a verdade — não havia recorte —, e é isso que o Log da IA precisa mostrar
-- quando alguém for conferir o que a IA perguntou ao banco.
--
-- Nada de RLS muda aqui: as duas funções continuam `security invoker` (sem
-- `security definer`), então quem lê é o usuário do JWT e as policies de
-- `expense` / `income` seguem valendo linha a linha.
--
-- ⚠️ Rode no SQL Editor. `create or replace` mantém os grants existentes, porque
-- a ASSINATURA não muda: os tipos dos parâmetros são os mesmos, só ganharam
-- `default null`. Se a assinatura mudasse, o `grant execute` teria de ser
-- refeito — e é por isso que o `default` entra sem mexer nos tipos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- expense_report — total e quantidade de gastos de um recorte (agora opcional)
-- -----------------------------------------------------------------------------
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
   -- Null = sem limite deste lado. O recorte continua FECHADO no início e ABERTO
   -- no fim quando as datas vêm, que é a convenção do resto do sistema
   -- (`src/shared/utils/datas.ts` e `limitesDoPeriodo`, na Edge Function).
   where (p_from is null or e.occurred_at >= p_from)
     and (p_to   is null or e.occurred_at <  p_to)
     and (case
            when p_uncategorized then e.category_id is null
            when p_category_ids is null then true
            else e.category_id = any (p_category_ids)
          end)
     and (p_search is null or e.name ilike '%' || p_search || '%');
$$;

-- -----------------------------------------------------------------------------
-- income_report — o mesmo, do lado das receitas
-- -----------------------------------------------------------------------------
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

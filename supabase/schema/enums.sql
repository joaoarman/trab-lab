-- =========================================================================
-- enums.sql
-- Tipos enumerados (domínios fechados).
-- Estado ATUAL do banco para esta entidade.
-- =========================================================================

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

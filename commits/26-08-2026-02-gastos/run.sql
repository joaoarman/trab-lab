-- =========================================================================
-- run.sql — TODO o SQL rodado na implementação 04 (Gastos).
-- Data: 26/08/2026
--
-- Uma migration só. Copiar e colar no SQL Editor do Supabase, de uma vez.
-- Estado resultante do banco: supabase/schema/ (por entidade) e
-- supabase/schema/full_schema.sql (completo).
--
-- ATENÇÃO à seção 8: esta migration NÃO só cria a tabela `expense` — ela também
-- troca o corpo de `category_linked_records`, que era o ponto de extensão do
-- módulo de Categorias. A partir daqui, uma categoria com gasto vinculado passa
-- a ser DESATIVADA em vez de excluída.
-- =========================================================================


-- >>> supabase/migrations/20260826105604_gastos.sql

-- =========================================================================
-- 20260826105604_gastos.sql
--
-- O módulo de Gastos do Self OS: o enum `currency`, a tabela `expense`, a RLS
-- por dono, a guarda que calcula o valor em reais e a regra de exclusão. E, no
-- fim, o encaixe que faltava no módulo de Categorias: `category_linked_records`
-- passa a CONTAR gastos.
--
-- MODELO DE ACESSO: B2C por usuário. Todo gasto é de UM
-- perfil, e cada pessoa só enxerga o que é seu. Quem garante isso é a RLS daqui
-- — o front-end NÃO escreve o filtro por dono nas queries.
--
-- AS DECISÕES DESTA MIGRATION (o porquê de cada uma está no bloco que a implementa):
--   • DINHEIRO É `numeric(12,2)` — reais e centavos na mesma coluna, como se lê
--     ("50.00" são cinquenta reais). O que NÃO se usa aqui é `float`: `numeric` é
--     decimal EXATO, então a soma de mil linhas fecha no centavo. Com `float`,
--     0.1 + 0.2 já não dá 0.3, e um extrato que não fecha não serve para nada.
--   • DUAS COLUNAS DE VALOR: `amount` é o que a pessoa gastou, na moeda em que
--     gastou; `amount_brl` é o mesmo valor em reais. Todo total do sistema soma a
--     segunda — senão dólar e real entrariam na mesma conta.
--   • QUEM CONVERTE É O BANCO. O cliente manda valor, moeda e cotação; a trigger
--     calcula os reais. Assim não existe caminho para gravar um trio incoerente
--     (US$ 50 · cotação 5,16 · "R$ 10").
--   • EXCLUIR É SOFT-DELETE, igual a `category`: `deleted_at` preenchido, a linha
--     some da RLS e `is_active` vai a false junto.
--   • `is_active` NASCE SEM FUNÇÃO PRÓPRIA — hoje ela só acompanha o
--     `deleted_at`. Está aqui desde já para o dia em que "arquivar sem excluir"
--     for um gesto do produto, e para o gasto falar a mesma língua da categoria.
--
-- Copiar e colar no SQL Editor do Supabase.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. O enum da moeda
-- -------------------------------------------------------------------------
-- Domínio FECHADO, e é isso que se quer: um `text` aceitaria 'R$', 'reais',
-- 'brl' e 'BRL ' como quatro moedas diferentes, e o relatório por moeda passaria
-- a depender de o front-end nunca errar a digitação.
--
-- Só BRL e USD. Uma moeda nova é um `alter type ... add value` numa migration
-- futura — e aí a conversão continua valendo, porque `exchange_rate` já é
-- "quantos reais vale 1 unidade desta moeda", e não "quantos reais vale 1 dólar".
-- O `if` existe porque `create type` não aceita `if not exists`, e a migration
-- precisa poder ser colada duas vezes sem quebrar no meio.
do $$
begin
  if to_regtype('public.currency') is null then
    create type public.currency as enum ('BRL', 'USD');
  end if;
end
$$;

comment on type public.currency is 'Moedas aceitas em um lançamento. BRL é o padrão; USD é convertido para reais na gravação.';


-- -------------------------------------------------------------------------
-- 2. Tabela
-- -------------------------------------------------------------------------
create table if not exists public.expense (
  id         int generated always as identity primary key,

  -- O dono. O DEFAULT é o que permite o front inserir sem nunca mencionar o
  -- profile_id: ele não tem grant nesta coluna (ver seção 7), então não pode
  -- forjar o dono nem por engano nem de propósito — quem preenche é o banco.
  profile_id int not null default public.current_profile_id()
             references public.profile (id) on delete cascade,

  -- A categoria do gasto — folha ou nó do meio da árvore, tanto faz: "quanto
  -- gastei com Carro?" soma Carro E os descendentes (`category_subtree`).
  --
  -- NULO é permitido, e é uma decisão de produto: quem acabou de criar a conta
  -- não tem nenhuma categoria ainda, e obrigar a criar uma antes de registrar o
  -- primeiro gasto é exatamente a fricção que este sistema existe para eliminar
  --. O gasto entra "Sem categoria" e é classificado
  -- depois — pela tela ou pelo Chat.
  --
  -- A FK real é COMPOSTA (ver expense_category_fk, no fim da tabela).
  category_id int,

  -- Onde/no que foi o gasto: "posto de gasolina", "mercado", "almoço". É o que a
  -- pessoa reconhece na lista batendo o olho — a categoria diz a gaveta, o nome
  -- diz o episódio.
  name       text not null,

  -- O VALOR, NA MOEDA DE `currency`. US$ 50,00 → 50.00, com currency = 'USD'.
  --
  -- `numeric`, e nunca `float`/`double`: numeric guarda o decimal EXATO, com a
  -- escala declarada, e soma sem erro acumulado. Em ponto flutuante, 0.1 + 0.2 dá
  -- 0.30000000000000004 — some isso mil vezes num extrato e o total deixa de bater
  -- com a conta que a pessoa faz no papel.
  --
  -- (12,2) = até 9.999.999,99 com dois decimais fixos. O banco ARREDONDA para a
  -- escala ao gravar, então não há como um terceiro decimal entrar escondido.
  amount     numeric(12,2) not null,

  currency   public.currency not null default 'BRL',

  -- A TAXA DE CÂMBIO usada no momento do registro: quantos reais vale UMA
  -- unidade de `currency`. Nula quando a moeda já é o real — não há o que
  -- converter, e guardar 1,000000 ali seria inventar uma cotação que ninguém
  -- consultou.
  --
  -- Ela é guardada, e não recalculada na leitura, porque cotação é um fato
  -- DATADO: o gasto de US$ 50 de março valeu o dólar de março. Um extrato que
  -- reconverte tudo pela cotação de hoje muda de valor sozinho toda manhã.
  --
  -- numeric, nunca float: 6 casas decimais exatas. O `round()` da conversão
  -- (seção 4) depende disso para fechar o centavo.
  exchange_rate numeric(14,6),

  -- O MESMO VALOR EM REAIS. É a coluna que TODO total do sistema soma — o mês, o
  -- gráfico por categoria, a resposta do Chat.
  --
  -- Quem a preenche é a trigger da seção 4, sempre; o cliente não tem grant
  -- nela. Sem isso, o app poderia gravar "US$ 50, cotação 5,16, R$ 10,00" e o
  -- extrato mentiria sem nenhuma linha inconsistente à vista.
  amount_brl numeric(12,2) not null default 0,

  -- QUANDO O GASTO ACONTECEU — que não é quando ele foi registrado.
  --
  -- É a diferença entre esta coluna e `created_at`, e ela é o motivo de a coluna
  -- existir: dá para lançar hoje, às 23h, o almoço de ontem. Ordenar o extrato
  -- por `created_at` colocaria esse almoço no topo, como se fosse a coisa mais
  -- recente que a pessoa fez.
  --
  -- Com HORA (timestamptz), e não só a data: é o que o cartão de confirmação do
  -- Chat promete mostrar ("data e hora"), e é o que separa dois cafés do mesmo
  -- dia na lista.
  occurred_at timestamptz not null default now(),

  -- Ativo. Hoje só acompanha o `deleted_at` (excluído ⇒ inativo) e não tem gesto
  -- próprio na tela — ver a nota no cabeçalho.
  is_active  boolean not null default true,

  -- Soft-delete. Null = existe. Preenchida = deixou de existir para o app (a RLS
  -- da seção 6 nem devolve a linha). O histórico sobrevive no banco.
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expense_name_len check (char_length(name) between 1 and 80),

  -- Gasto é sempre positivo. "Saiu dinheiro" já está dito pela tabela em que a
  -- linha mora; um gasto negativo seria uma receita disfarçada, e receita tem
  -- tabela própria. O piso é UM CENTAVO — `> 0` deixaria passar 0.001, que a
  -- escala da coluna arredondaria para zero e gravaria um gasto de nada.
  --
  -- O teto repete o que o `numeric(12,2)` já garante, e de propósito: assim a
  -- conversão da seção 4 esbarra numa mensagem que a tela sabe traduzir, em vez
  -- do "numeric field overflow" cru do Postgres.
  constraint expense_amount_range     check (amount     between 0.01 and 9999999.99),
  constraint expense_amount_brl_range check (amount_brl between 0.01 and 9999999.99),

  -- A COERÊNCIA DO TRIO (moeda · cotação · valor em reais), em constraints — e
  -- não só na trigger que as preenche. Trigger é código; constraint é garantia.
  -- Um UPDATE manual no SQL Editor passa por cima da primeira e esbarra na
  -- segunda.
  --
  --   • em reais: sem cotação, e o valor em reais é o próprio valor;
  --   • em outra moeda: cotação obrigatória e positiva.
  constraint expense_brl_has_no_rate check (
    currency <> 'BRL' or (exchange_rate is null and amount_brl = amount)
  ),
  constraint expense_foreign_has_rate check (
    currency = 'BRL' or (exchange_rate is not null and exchange_rate > 0)
  ),

  -- EXCLUÍDO É SEMPRE INATIVO — o mesmo invariante da `category`, pelo mesmo
  -- motivo: evita o estado ambíguo "excluído, mas ativo".
  constraint expense_deleted_is_inactive check (deleted_at is null or is_active = false),

  -- A FK inclui o profile_id NOS DOIS LADOS, exatamente como em `category`. Uma
  -- FK simples (category_id → category.id) aceitaria pendurar o MEU gasto numa
  -- categoria SUA: eu não consigo ler a sua linha por causa da RLS, mas o id é
  -- um inteiro pequeno e chutá-lo é trivial. Com as duas colunas, o banco exige
  -- que gasto e categoria sejam do mesmo perfil — por integridade referencial,
  -- não por uma policy que alguém pode esquecer.
  --
  -- Com `category_id` nulo a FK não é cobrada (MATCH SIMPLE, o padrão): é o que
  -- permite o gasto "Sem categoria".
  --
  -- `on delete cascade` porque a única exclusão real de categoria acontece
  -- quando o PERFIL inteiro é apagado — e aí os gastos vão junto de qualquer
  -- forma. No dia a dia a categoria nunca é apagada de verdade: `category_remove`
  -- faz soft-delete, e a partir desta migration nem isso, porque uma categoria
  -- com gastos passa a ser DESATIVADA (seção 8).
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
-- 3. Índices
-- -------------------------------------------------------------------------

-- A leitura da tela e a do Chat: "os gastos deste perfil, neste período, do mais
-- recente para o mais antigo". As três colunas na ordem em que a query as usa —
-- filtra por perfil, recorta o período, já entrega ordenado.
create index if not exists expense_profile_occurred_idx
  on public.expense (profile_id, occurred_at desc)
  where deleted_at is null;

-- O filtro por categoria da tela E a contagem de vínculos que decide se uma
-- categoria pode ser excluída (seção 8) — as duas percorrem por category_id.
create index if not exists expense_category_idx
  on public.expense (category_id)
  where deleted_at is null;


-- -------------------------------------------------------------------------
-- 4. A guarda de escrita (trigger) — é aqui que a conversão acontece
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

drop trigger if exists on_expense_before_write on public.expense;
create trigger on_expense_before_write
  before insert or update on public.expense
  for each row execute function public.expense_guard();


-- -------------------------------------------------------------------------
-- 5. A remoção
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


-- -------------------------------------------------------------------------
-- 6. RLS + policies
-- -------------------------------------------------------------------------
alter table public.expense enable row level security;

-- `deleted_at is null` entra nas policies, e não só nas queries do front: assim
-- "excluído sumiu" é uma garantia do BANCO, não uma convenção que alguém pode
-- esquecer de repetir na próxima tela (ou no Chat, ou no Log da IA).
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


-- -------------------------------------------------------------------------
-- 7. Grants (menor privilégio)
-- -------------------------------------------------------------------------
-- A RLS diz QUAIS LINHAS; o grant de coluna diz QUAIS COLUNAS. Aqui é o segundo
-- que importa, e por dois motivos distintos:
--
--   • `amount_brl` fora do grant é o que torna a conversão da seção 4
--     INESCAPÁVEL. Com grant, o cliente poderia mandar "US$ 50, cotação 5,16,
--     R$ 10,00" pela API REST e o total do mês passaria a mentir, sem nenhuma
--     linha estranha à vista.
--   • `is_active` e `deleted_at` fora do grant fazem de `expense_remove()` a
--     única saída. Com grant, dava para desfazer uma exclusão zerando a coluna.
--
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


-- -------------------------------------------------------------------------
-- 8. O encaixe no módulo de Categorias
-- -------------------------------------------------------------------------
-- `category_linked_records` era o PONTO DE EXTENSÃO deixado pronto na migration
-- das categorias: ela devolvia 0 porque a tabela `expense` ainda não existia.
-- Agora existe.
--
-- Com esta única troca de corpo, e mais nada:
--   • `category_impact` passa a contar os gastos na prévia da modal ("2
--     lançamentos usam esta categoria");
--   • `category_remove` passa a DESATIVAR, em vez de excluir, toda categoria que
--     já tenha gasto — e o histórico financeiro deixa de correr o risco de
--     apontar para o vazio.
-- Nenhuma alteração é necessária na tela de Categorias: os textos da modal já
-- previam este caso, e a decisão sempre foi do banco.
--
-- `income` entra aqui do mesmo jeito quando o módulo de Receitas for feito:
--     + (select count(*) from public.income i where i.category_id = any (p_category_ids))
--
-- Não filtra por perfil de propósito: os ids que ela recebe vêm sempre de
-- `category_subtree`, que já os limitou ao perfil de quem chamou.
--
-- `deleted_at is null` no filtro: um gasto excluído não é vínculo. Se contasse,
-- uma categoria usada uma única vez, num gasto já apagado, nunca mais poderia
-- ser excluída — presa por um registro que ninguém mais enxerga.
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

-- =========================================================================
-- 20260826170132_receitas.sql
--
-- O módulo de Receitas do Self OS: a tabela `income`, a RLS por dono, a guarda
-- que calcula o valor em reais e a regra de exclusão. É o espelho de `expense`
-- — mesma mecânica de moeda, mesma exclusão, sinal contrário — com UMA
-- diferença estrutural, explicada logo abaixo.
--
-- MODELO DE ACESSO: B2C por usuário. Toda receita é de UM
-- perfil, e cada pessoa só enxerga o que é seu. Quem garante isso é a RLS daqui
-- — o front-end NÃO escreve o filtro por dono nas queries.
--
-- AS DECISÕES DESTA MIGRATION:
--
--   • RECEITA NÃO TEM CATEGORIA. Não é simplificação: é o que a natureza do
--     dado pede. Gasto se pergunta "em quê?" — e a resposta é uma árvore
--     inteira (Carro › Gasolina), porque um mês tem dezenas de gastos
--     espalhados. Receita se pergunta "de onde?", e a resposta cabe no nome:
--     salário, freela, aluguel. São três ou quatro linhas por mês, e classificar
--     três linhas numa hierarquia é fricção sem retorno. Consequências práticas: a `income` NÃO tem `category_id`, não entra
--     em `category_linked_records`, e desativar/excluir uma categoria continua
--     sendo assunto exclusivo de `expense`.
--
--   • DUAS DATAS, e as duas aparecem na tela:
--       - `received_at` — QUANDO O DINHEIRO ENTROU. Editável, é por ela que a
--         lista ordena e agrupa. É o espelho do `occurred_at` do gasto.
--       - `created_at` — QUANDO A LINHA FOI CRIADA no sistema. Automática.
--     A distinção existe porque dá para lançar hoje o salário que caiu na
--     sexta; ordenar pelo registro colocaria esse salário no topo, como se
--     tivesse acabado de entrar. Em Gastos o `created_at` fica só no banco;
--     aqui ele é EXIBIDO, a pedido — a lista mostra "recebida em" e "registrada
--     em", e a diferença entre as duas é auditável a olho nu.
--
--   • DINHEIRO É `numeric(12,2)` — reais e centavos na mesma coluna, como se lê
--     ("50.00" são cinquenta reais). O que NÃO se usa aqui é `float`: `numeric`
--     é decimal EXATO, então a soma de mil linhas fecha no centavo. Com `float`,
--     0.1 + 0.2 já não dá 0.3, e um extrato que não fecha não serve para nada.
--
--   • DUAS COLUNAS DE VALOR: `amount` é o que a pessoa recebeu, na moeda em que
--     recebeu; `amount_brl` é o mesmo valor em reais. Todo total do sistema soma
--     a segunda — senão dólar e real entrariam na mesma conta.
--
--   • QUEM CONVERTE É O BANCO. O cliente manda valor, moeda e cotação; a trigger
--     calcula os reais. Assim não existe caminho para gravar um trio incoerente
--     (US$ 50 · cotação 5,16 · "R$ 10").
--
--   • EXCLUIR É SOFT-DELETE, igual a `expense` e a `category`: `deleted_at`
--     preenchido, a linha some da RLS e `is_active` vai a false junto.
--
-- Copiar e colar no SQL Editor do Supabase.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. Tabela
-- -------------------------------------------------------------------------
-- O enum `public.currency` já existe (migration de Gastos, 20260826105604) e é
-- REAPROVEITADO aqui de propósito: gasto e receita falam da mesma moeda, e um
-- segundo enum "income_currency" faria o Chat ter de saber qual dos dois usar
-- ao ler "recebi 500 dólares".
create table if not exists public.income (
  id         int generated always as identity primary key,

  -- O dono. O DEFAULT é o que permite o front inserir sem nunca mencionar o
  -- profile_id: ele não tem grant nesta coluna (ver seção 6), então não pode
  -- forjar o dono nem por engano nem de propósito — quem preenche é o banco.
  profile_id int not null default public.current_profile_id()
             references public.profile (id) on delete cascade,

  -- DE ONDE VEIO o dinheiro: "salário", "freela do site", "aluguel do 302".
  -- É o único descritor da receita — não há categoria (ver o cabeçalho), então
  -- este campo carrega sozinho o que a hierarquia carrega no gasto. Por isso o
  -- limite é 80, o mesmo de `expense.name`: cabe uma frase curta de verdade.
  name       text not null,

  -- O VALOR, NA MOEDA DE `currency`. US$ 500,00 → 500.00, com currency = 'USD'.
  --
  -- `numeric`, e nunca `float`/`double`: numeric guarda o decimal EXATO, com a
  -- escala declarada, e soma sem erro acumulado. Em ponto flutuante, 0.1 + 0.2
  -- dá 0.30000000000000004 — some isso mil vezes e o total deixa de bater com a
  -- conta que a pessoa faz no papel.
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
  -- DATADO: o freela de US$ 500 recebido em março valeu o dólar de março. Um
  -- extrato que reconverte tudo pela cotação de hoje muda de valor sozinho toda
  -- manhã, e nenhum mês fecha com o anterior.
  exchange_rate numeric(14,6),

  -- O MESMO VALOR EM REAIS. É a coluna que TODO total do sistema soma — o mês, o
  -- saldo contra os gastos, a resposta do Chat.
  --
  -- Quem a preenche é a trigger da seção 3, sempre; o cliente não tem grant
  -- nela. Sem isso, o app poderia gravar "US$ 500, cotação 5,16, R$ 10,00" e o
  -- extrato mentiria sem nenhuma linha inconsistente à vista.
  amount_brl numeric(12,2) not null default 0,

  -- QUANDO O DINHEIRO ENTROU — que não é quando a receita foi registrada.
  --
  -- É a diferença entre esta coluna e `created_at`, e as DUAS aparecem na tela
  -- deste módulo (ver o cabeçalho). Dá para lançar na segunda o salário que caiu
  -- na sexta: ordenar por `created_at` colocaria esse salário no topo, como se
  -- tivesse acabado de entrar.
  --
  -- Com HORA (timestamptz), e não só a data: é o que o cartão de confirmação do
  -- Chat promete mostrar ("data e hora").
  received_at timestamptz not null default now(),

  -- Ativa. Hoje só acompanha o `deleted_at` (excluída ⇒ inativa) e não tem gesto
  -- próprio na tela. Está aqui para o dia em que "arquivar sem excluir" for uma
  -- ação do produto, e para a receita falar a mesma língua do gasto.
  is_active  boolean not null default true,

  -- Soft-delete. Null = existe. Preenchida = deixou de existir para o app (a RLS
  -- da seção 5 nem devolve a linha). O histórico sobrevive no banco.
  deleted_at timestamptz,

  -- QUANDO A RECEITA FOI REGISTRADA. Não é decoração: esta coluna é LIDA pela
  -- tela ("registrada em ..."), ao contrário do que acontece em `expense`.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint income_name_len check (char_length(name) between 1 and 80),

  -- Receita é sempre positiva. "Entrou dinheiro" já está dito pela tabela em que
  -- a linha mora; uma receita negativa seria um gasto disfarçado, e gasto tem
  -- tabela própria. O piso é UM CENTAVO — `> 0` deixaria passar 0.001, que a
  -- escala da coluna arredondaria para zero e gravaria uma receita de nada.
  --
  -- O teto repete o que o `numeric(12,2)` já garante, e de propósito: assim a
  -- conversão da seção 3 esbarra numa mensagem que a tela sabe traduzir, em vez
  -- do "numeric field overflow" cru do Postgres.
  constraint income_amount_range     check (amount     between 0.01 and 9999999.99),
  constraint income_amount_brl_range check (amount_brl between 0.01 and 9999999.99),

  -- A COERÊNCIA DO TRIO (moeda · cotação · valor em reais), em constraints — e
  -- não só na trigger que as preenche. Trigger é código; constraint é garantia.
  -- Um UPDATE manual no SQL Editor passa por cima da primeira e esbarra na
  -- segunda.
  --
  --   • em reais: sem cotação, e o valor em reais é o próprio valor;
  --   • em outra moeda: cotação obrigatória e positiva.
  constraint income_brl_has_no_rate check (
    currency <> 'BRL' or (exchange_rate is null and amount_brl = amount)
  ),
  constraint income_foreign_has_rate check (
    currency = 'BRL' or (exchange_rate is not null and exchange_rate > 0)
  ),

  -- EXCLUÍDA É SEMPRE INATIVA — o mesmo invariante de `expense` e `category`,
  -- pelo mesmo motivo: evita o estado ambíguo "excluída, mas ativa".
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


-- -------------------------------------------------------------------------
-- 2. Índice
-- -------------------------------------------------------------------------
-- A leitura da tela e a do Chat: "as receitas deste perfil, neste período, da
-- mais recente para a mais antiga". As colunas na ordem em que a query as usa —
-- filtra por perfil, recorta o período, já entrega ordenado.
--
-- É o ÚNICO índice do módulo, e a ausência do segundo é a diferença de Gastos:
-- lá existe `expense_category_idx` porque a tela filtra por categoria e porque
-- `category_linked_records` conta por categoria. Aqui não há categoria, então
-- não há nada por onde percorrer além do dono e do período.
create index if not exists income_profile_received_idx
  on public.income (profile_id, received_at desc)
  where deleted_at is null;


-- -------------------------------------------------------------------------
-- 3. A guarda de escrita (trigger) — é aqui que a conversão acontece
-- -------------------------------------------------------------------------
-- Normaliza o nome, sustenta "excluída é sempre inativa" e, o principal,
-- CALCULA O VALOR EM REAIS.
--
-- O cálculo mora aqui, e não no front-end, porque `amount_brl` é a coluna que
-- todos os totais somam. Se o cliente a enviasse, bastaria uma versão antiga do
-- app, uma chamada direta à API REST ou um bug de arredondamento para o extrato
-- passar a mentir — e mentir de um jeito invisível, porque cada linha
-- continuaria parecendo perfeitamente normal.
--
-- Ao contrário de `expense_guard`, esta função NÃO consulta nenhuma outra
-- tabela: sem categoria, não há dono a conferir além do que a RLS já garante.
-- Ainda assim é `security definer` com `search_path` fixo, pelo mesmo motivo de
-- higiene das demais — uma trigger não deve depender do `search_path` de quem
-- disparou a escrita.
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

  -- EXCLUÍDA É SEMPRE INATIVA. Escrito aqui (e não deixado para quem chama) para
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
      raise exception 'income_rate_required'
        using errcode = 'P0001',
              hint = 'Receita em moeda estrangeira exige a cotacao.';
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


-- -------------------------------------------------------------------------
-- 4. A remoção
-- -------------------------------------------------------------------------
-- Excluir uma receita é SOFT-DELETE: `deleted_at` preenchido, `is_active` a
-- false pela trigger, e a linha some da RLS.
--
-- É uma RPC, e não um `update` do cliente, porque o cliente NÃO TEM GRANT em
-- `deleted_at` (seção 6) — de propósito. Com grant, um `update` pela API REST
-- poderia tanto excluir quanto RESSUSCITAR uma receita zerando a coluna, e a
-- "exclusão" viraria uma sugestão. Aqui a porta é uma só, e ela abre num
-- sentido.
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

  -- Nenhuma linha tocada = a receita não existe, já foi excluída OU é de outra
  -- pessoa. A mensagem é a mesma nos três casos, de propósito: distinguir "não
  -- existe" de "não é sua" confirmaria a existência de um id alheio.
  if not found then
    raise exception 'income_not_found' using errcode = 'P0001';
  end if;
end;
$$;


-- -------------------------------------------------------------------------
-- 5. RLS + policies
-- -------------------------------------------------------------------------
alter table public.income enable row level security;

-- `deleted_at is null` entra nas policies, e não só nas queries do front: assim
-- "excluída sumiu" é uma garantia do BANCO, não uma convenção que alguém pode
-- esquecer de repetir na próxima tela (ou no Chat, ou no Log da IA).
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

-- Sem policy de DELETE, de propósito: a saída é o soft-delete de
-- `income_remove()`. Um DELETE de verdade levaria o histórico embora, e um
-- extrato que perde linhas para sempre não fecha com o mês anterior.


-- -------------------------------------------------------------------------
-- 6. Grants (menor privilégio)
-- -------------------------------------------------------------------------
-- A RLS diz QUAIS LINHAS; o grant de coluna diz QUAIS COLUNAS. Aqui é o segundo
-- que importa, e por dois motivos distintos:
--
--   • `amount_brl` fora do grant é o que torna a conversão da seção 3
--     INESCAPÁVEL. Com grant, o cliente poderia mandar "US$ 500, cotação 5,16,
--     R$ 10,00" pela API REST e o total do mês passaria a mentir, sem nenhuma
--     linha estranha à vista.
--   • `is_active` e `deleted_at` fora do grant fazem de `income_remove()` a
--     única saída. Com grant, dava para desfazer uma exclusão zerando a coluna.
--
-- `created_at` também fica de fora, e neste módulo isso VALE MAIS que em Gastos:
-- a tela EXIBE "registrada em". Com grant de escrita, o cliente poderia
-- antedatar o próprio registro, e a coluna que existe justamente para dizer
-- quando a linha entrou no sistema deixaria de servir para isso.
--
-- `profile_id` também fica de fora: quem o preenche é o DEFAULT.
revoke all on public.income from anon, authenticated;
grant select on public.income to authenticated;
grant insert (name, amount, currency, exchange_rate, received_at)
      on public.income to authenticated;
grant update (name, amount, currency, exchange_rate, received_at)
      on public.income to authenticated;

-- Função de trigger: ninguém chama à mão.
revoke execute on function public.income_guard() from public, anon, authenticated;

-- O que a tela chama: só quem está logado.
revoke execute on function public.income_remove(int) from public, anon;
grant  execute on function public.income_remove(int) to authenticated;


-- -------------------------------------------------------------------------
-- 7. O que esta migration NÃO faz — e por quê
-- -------------------------------------------------------------------------
-- `category_linked_records` continua contando SÓ gastos.
--
-- A migration de Gastos deixou ali um comentário prevendo que `income` entraria
-- nessa conta quando o módulo existisse. Ele partia da hipótese de que receita
-- teria categoria — e a decisão desta migration foi a oposta (ver o cabeçalho).
-- Sem `category_id` na `income`, não existe vínculo a contar: uma categoria com
-- receitas é uma situação que não pode acontecer, e somar zero seria só um JOIN
-- a mais em cada exclusão de categoria.
--
-- Nada a alterar, portanto — nem na função, nem na tela de Categorias. O
-- comentário desatualizado foi corrigido em `supabase/schema/functions.sql`, que
-- é o retrato do estado atual; a migration antiga não se edita (forward-only).

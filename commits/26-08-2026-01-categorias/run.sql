-- =========================================================================
-- run.sql — TODO o SQL rodado na implementação 03 (Categorias).
-- Data: 26/08/2026
--
-- Uma migration só. Copiar e colar no SQL Editor do Supabase, de uma vez.
-- Estado resultante do banco: supabase/schema/ (por entidade) e
-- supabase/schema/full_schema.sql (completo).
-- =========================================================================


-- >>> supabase/migrations/20260826100316_categorias.sql

-- =========================================================================
-- 20260826100316_categorias.sql
--
-- A hierarquia de categorias do Self OS: a tabela `category` (auto-relacionada),
-- a RLS por dono, as guardas de integridade da árvore e a regra de
-- exclusão/desativação.
--
-- MODELO DE ACESSO: B2C por usuário. Toda categoria é de UM
-- perfil, e cada pessoa só enxerga o que é seu. Quem garante isso é a RLS daqui
-- — o front-end NÃO escreve o filtro por dono nas queries.
--
-- AS DECISÕES DESTA MIGRATION (o porquê de cada uma está no bloco que a implementa):
--   • EXCLUIR é SOFT-DELETE: `deleted_at` preenchido. A linha sobrevive para o
--     histórico financeiro não ficar apontando para o vazio, mas some da RLS —
--     do ponto de vista do app, ela deixou de existir.
--   • EXCLUÍDA É SEMPRE INATIVA: `deleted_at` preenchido força `is_active =
--     false`, por trigger E por check constraint.
--   • TER FILHA CONTA COMO VÍNCULO: uma categoria com descendentes (ou, no
--     futuro, com gastos/receitas) não é excluída — é DESATIVADA, junto com toda
--     a subárvore.
--   • A DECISÃO É DO BANCO, não da tela: `category_remove()` recalcula tudo na
--     hora de agir. A tela só pergunta antes (`category_impact()`) para escrever
--     a frase certa na modal de confirmação.
--
-- Copiar e colar no SQL Editor do Supabase.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. Tabela
-- -------------------------------------------------------------------------
-- Uma árvore de profundidade livre (`Carro › Gasolina`, `Casa › Mercado › Feira`),
-- guardada do jeito clássico: cada linha aponta para a mãe. Sem mãe = categoria
-- de topo.
create table if not exists public.category (
  id         int generated always as identity primary key,

  -- O dono. O DEFAULT é o que permite o front inserir sem nunca mencionar o
  -- profile_id: ele não tem grant nesta coluna (ver seção 6), então não pode
  -- forjar o dono nem por engano nem de propósito — quem preenche é o banco.
  profile_id int not null default public.current_profile_id()
             references public.profile (id) on delete cascade,

  -- A mãe. A FK real é COMPOSTA, lá embaixo — ver a nota em category_parent_fk.
  parent_id  int,

  name       text not null,

  -- Cor de leitura da categoria, em hexadecimal ('#10b981').
  --
  -- Isto é DADO DO USUÁRIO, não identidade visual do sistema: a paleta, as
  -- fontes e o raio do app vivem em src/theme.css e continuam vindo de lá. O que
  -- se guarda aqui é a etiqueta que a pessoa escolheu para "Carro" ser verde e
  -- "Casa" ser roxa — por isso é uma coluna, e não um token de tema.
  color      text not null default '#10b981',

  -- Desativada: continua existindo, some da árvore principal e vai para o
  -- submenu "Desativadas", de onde pode voltar. É o destino de quem NÃO pode ser
  -- excluída por ter algo vinculado.
  is_active  boolean not null default true,

  -- Soft-delete. Null = existe. Preenchida = deixou de existir para o app (a RLS
  -- da seção 5 nem devolve a linha).
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint category_name_len   check (char_length(name) between 1 and 60),

  -- Hexadecimal de 6 dígitos, minúsculo. O trigger normaliza antes de o check
  -- rodar, então '#10B981' vindo de um <input type="color"> passa.
  constraint category_color_hex  check (color ~ '^#[0-9a-f]{6}$'),

  -- O ciclo de tamanho 1. Os ciclos maiores (A → B → A) são caçados pelo
  -- trigger da seção 3, que uma constraint não consegue enxergar.
  constraint category_no_self_parent check (parent_id is distinct from id),

  -- EXCLUÍDA É SEMPRE INATIVA — a regra que evita o estado ambíguo "excluída,
  -- mas ativa". O trigger já força isso ao gravar; este check é a garantia de
  -- que nem um UPDATE manual no SQL Editor consegue criar a linha esquisita.
  constraint category_deleted_is_inactive check (deleted_at is null or is_active = false),

  -- Existe para ser o alvo da FK composta abaixo (uma FK precisa apontar para
  -- uma chave única). É redundante com a PK, e de propósito.
  constraint category_id_profile_uk unique (id, profile_id),

  -- A FK inclui o profile_id NOS DOIS LADOS. Sem isso, uma FK simples
  -- (parent_id → id) aceitaria pendurar a minha categoria debaixo da SUA: eu não
  -- consigo LER a sua linha por causa da RLS, mas o id é um inteiro pequeno e
  -- chutá-lo é trivial. Com as duas colunas na FK, o banco exige que mãe e filha
  -- sejam do mesmo perfil — a árvore não atravessa contas, e isso é garantido
  -- por integridade referencial, não por uma policy que alguém pode esquecer.
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


-- -------------------------------------------------------------------------
-- 2. Índices
-- -------------------------------------------------------------------------

-- A leitura da tela: "todas as categorias vivas deste perfil".
create index if not exists category_profile_idx
  on public.category (profile_id)
  where deleted_at is null;

-- A subida e a descida da árvore (o WITH RECURSIVE da seção 4 e a FK).
create index if not exists category_parent_idx
  on public.category (parent_id)
  where deleted_at is null;

-- Duas irmãs não podem ter o mesmo nome, ignorando maiúsculas.
--
-- Não é preciosismo: quando o Chat for implementado, ele vai CRIAR CATEGORIA
-- SOZINHO ("gastei 20 no posto" → Carro › Gasolina). Esse "achar ou criar"
-- precisa de uma resposta única para "existe uma Gasolina dentro de Carro?" —
-- com duas Gasolina irmãs, metade dos gastos vai para uma e metade para a outra,
-- e o total do mês passa a mentir.
--
-- `coalesce(parent_id, 0)` porque, em índice único, NULL nunca colide com NULL:
-- sem o coalesce, nada impediria duas categorias de topo chamadas "Casa".
--
-- Só vale para as linhas vivas: uma categoria EXCLUÍDA libera o nome de volta.
-- Uma DESATIVADA não libera — ela ainda está lá, no submenu, esperando voltar; o
-- caminho certo é reativá-la, e a tela diz isso com todas as letras.
create unique index if not exists category_sibling_name_uk
  on public.category (profile_id, coalesce(parent_id, 0), lower(name))
  where deleted_at is null;


-- -------------------------------------------------------------------------
-- 3. Guarda de integridade da árvore (trigger)
-- -------------------------------------------------------------------------
-- Normaliza o que dá para normalizar e recusa o que quebraria a árvore.
--
-- `security definer` porque a função precisa SUBIR pelos ancestrais para caçar
-- ciclo, e essa subida não pode depender da RLS de quem está gravando. A FK
-- composta já garante que todo ancestral é do mesmo perfil, então não há dado de
-- terceiro alcançável por aqui.
create or replace function public.category_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancestral   int;
  v_saltos      int := 0;
  v_mae_e_nova  boolean;
begin
  new.name  := trim(new.name);
  new.color := lower(new.color);
  new.updated_at := now();

  -- EXCLUÍDA É SEMPRE INATIVA. Escrito aqui (e não deixado para quem chama) para
  -- que não exista caminho — RPC, SQL Editor, script futuro — capaz de gravar
  -- uma linha excluída que ainda se diz ativa.
  if new.deleted_at is not null then
    new.is_active := false;
  end if;

  -- `old` só é tocado no ramo de UPDATE, e nunca ao lado de um `or`.
  --
  -- Num trigger de INSERT o `old` não está atribuído, e ler um campo dele
  -- levanta erro. Escrever `tg_op = 'INSERT' or new.parent_id is distinct from
  -- old.parent_id` PARECE seguro por curto-circuito — mas o PostgreSQL não
  -- garante a ordem de avaliação de um `or`, então o segundo lado pode ser
  -- avaliado primeiro e derrubar toda criação de categoria. Duas linhas a mais
  -- aqui trocam essa aposta por uma certeza.
  if tg_op = 'INSERT' then
    v_mae_e_nova := true;
  else
    v_mae_e_nova := new.parent_id is distinct from old.parent_id;
  end if;

  if new.parent_id is not null and v_mae_e_nova then

    -- TODA consulta daqui é presa a `new.profile_id`, e isso é segurança, não
    -- só correção.
    --
    -- Esta função é `security definer`: ela enxerga a tabela inteira, sem RLS. E
    -- triggers disparam ANTES das constraints — então, sem o filtro, alguém que
    -- inserisse uma categoria apontando para o `parent_id` de OUTRA pessoa
    -- receberia 'category_parent_deleted' quando a linha alheia estivesse
    -- excluída, e o erro de chave estrangeira quando não estivesse. Nenhuma
    -- linha seria criada nos dois casos, mas a diferença entre as duas mensagens
    -- já é um bit de informação sobre um id que não é dele — e um id é um
    -- inteiro pequeno, de percorrer em minutos.
    --
    -- Com o filtro, mãe de outro perfil é simplesmente "mãe que não existe", e o
    -- caminho passa a ser sempre o mesmo: a FK composta recusa.
    if exists (
      select 1 from public.category c
       where c.id = new.parent_id
         and c.profile_id = new.profile_id
         and c.deleted_at is not null
    ) then
      raise exception 'category_parent_deleted'
        using errcode = 'P0001',
              hint = 'A categoria mae foi excluida.';
    end if;

    -- MÃE INATIVA ⇒ A FILHA TAMBÉM. Sustenta o invariante de que a subárvore de
    -- uma categoria desativada está inteiramente desativada — é dele que a tela
    -- depende para separar a árvore principal do submenu "Desativadas".
    --
    -- Sem isto, uma filha ativa pendurada numa mãe desativada ficaria fora dos
    -- dois lugares: fora da árvore principal (a mãe não é desenhada) e fora do
    -- submenu (ela se diz ativa). Existiria no banco, sem caminho até ela na tela.
    if exists (
      select 1 from public.category c
       where c.id = new.parent_id
         and c.profile_id = new.profile_id
         and c.is_active = false
    ) then
      new.is_active := false;
    end if;

    -- CICLO. Subimos a partir da mãe pretendida: se em algum degrau chegarmos na
    -- própria linha, a "árvore" viraria um anel — e um anel faz o WITH RECURSIVE
    -- que soma os descendentes girar para sempre.
    v_ancestral := new.parent_id;
    while v_ancestral is not null loop
      if v_ancestral = new.id then
        raise exception 'category_cycle'
          using errcode = 'P0001',
                hint = 'Uma categoria nao pode ser descendente de si mesma.';
      end if;

      -- Rede de segurança: se um ciclo já existisse (criado por um UPDATE manual
      -- antes deste trigger existir), o loop acima não terminaria nunca.
      v_saltos := v_saltos + 1;
      if v_saltos > 100 then
        raise exception 'category_too_deep'
          using errcode = 'P0001',
                hint = 'Hierarquia profunda demais.';
      end if;

      select c.parent_id into v_ancestral
        from public.category c
       where c.id = v_ancestral
         and c.profile_id = new.profile_id;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists on_category_before_write on public.category;
create trigger on_category_before_write
  before insert or update on public.category
  for each row execute function public.category_guard();


-- -------------------------------------------------------------------------
-- 4. A regra de exclusão / desativação
-- -------------------------------------------------------------------------

-- --- 4.1 A subárvore -----------------------------------------------------
-- A categoria e todos os seus descendentes vivos. É a base de tudo: da decisão
-- de excluir, da desativação em cascata e, quando o Chat existir, do "quanto
-- gastei com carro esse mês?" (que soma Carro E tudo abaixo dele).
--
-- O filtro por dono está NA RAIZ da recursiva: como a FK é composta, todo
-- descendente de uma categoria minha é necessariamente meu.
create or replace function public.category_subtree(p_category_id int)
returns table (id int)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive arvore as (
    select c.id
      from public.category c
     where c.id = p_category_id
       and c.profile_id = public.current_profile_id()
       and c.deleted_at is null
    union all
    select f.id
      from public.category f
      join arvore a on f.parent_id = a.id
     where f.deleted_at is null
  )
  select arvore.id from arvore;
$$;

-- --- 4.2 Os registros vinculados ----------------------------------------
-- ***************** O PONTO DE EXTENSÃO DESTE MÓDULO **********************
--
-- Quantos LANÇAMENTOS (gastos, receitas) apontam para estas categorias.
--
-- Hoje devolve 0 porque as tabelas `expense` e `income` AINDA NÃO EXISTEM — os
-- módulos de Gastos e Receitas são placeholders. A função existe assim mesmo,
-- desde já, para que ligar essa conta seja UMA edição em UM lugar: a regra de
-- "exclui ou desativa?" já está escrita, testada e em uso.
--
-- QUANDO os módulos entrarem, troque o corpo por:
--
--     select (
--       (select count(*) from public.expense e where e.category_id = any (p_category_ids))
--     + (select count(*) from public.income  i where i.category_id = any (p_category_ids))
--     )::int;
--
-- e mais nada. `category_impact` e `category_remove` passam a desativar sozinhas
-- as categorias que já têm movimento, sem nenhuma outra alteração — nem no
-- banco, nem na tela, nem nos textos da modal de confirmação.
-- *************************************************************************
--
-- Não filtra por perfil de propósito: os ids que ela recebe vêm sempre de
-- `category_subtree`, que já os limitou ao perfil de quem chamou. Ao ligar as
-- contas acima, mantenha essa premissa — nunca chame esta função com ids que não
-- tenham passado por lá.
create or replace function public.category_linked_records(p_category_ids int[])
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select 0::int;
$$;

-- --- 4.3 A decisão -------------------------------------------------------
-- "Exclui ou desativa?", numa função só.
--
-- Ela é minúscula e existe por um motivo: a regra é consultada em DOIS momentos
-- distintos — quando a tela pergunta o que vai acontecer (para escrever a frase
-- da modal) e quando o banco de fato age. Escrita duas vezes, um dia as duas
-- divergem, e a modal passa a prometer uma coisa enquanto o banco faz outra.
create or replace function public.category_action_for(p_descendants int, p_records int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_descendants = 0 and p_records = 0 then 'delete' else 'deactivate' end;
$$;

-- --- 4.4 A prévia (para a modal de confirmação) --------------------------
-- O que ACONTECERIA se a categoria fosse excluída agora. A tela chama isto ao
-- abrir a confirmação, para dizer a verdade em vez de um texto genérico:
-- "3 subcategorias vão junto para Desativadas" é uma frase diferente de
-- "esta categoria será excluída".
--
-- É só uma PRÉVIA: quem decide de fato é a 4.5, no momento de agir.
create or replace function public.category_impact(p_category_id int)
returns table (descendants int, records int, action text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids int[];
begin
  select array_agg(s.id) into v_ids from public.category_subtree(p_category_id) s;

  -- Vazio = a categoria não existe OU não é deste perfil. A mensagem é a mesma
  -- nos dois casos, de propósito: distinguir "não existe" de "não é sua"
  -- confirmaria a existência de um id alheio.
  if v_ids is null then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;

  descendants := array_length(v_ids, 1) - 1;  -- a própria categoria não conta
  records     := public.category_linked_records(v_ids);
  action      := public.category_action_for(descendants, records);
  return next;
end;
$$;

-- --- 4.5 A ação ----------------------------------------------------------
-- Excluir a categoria — ou desativá-la, quando excluir não é possível.
--
-- Devolve o que REALMENTE aconteceu ('deleted' | 'deactivated'), e é esse
-- retorno que a tela usa para o aviso final. Nunca o que a prévia tinha dito: se
-- um gasto for lançado nessa categoria entre a abertura da modal e o clique de
-- confirmar, o certo é desativar, e é isso que a pessoa vai ler na tela.
create or replace function public.category_remove(p_category_id int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil  int := public.current_profile_id();
  v_ids     int[];
  v_records int;
begin
  select array_agg(s.id) into v_ids from public.category_subtree(p_category_id) s;
  if v_ids is null then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;

  v_records := public.category_linked_records(v_ids);

  if public.category_action_for(array_length(v_ids, 1) - 1, v_records) = 'delete' then
    -- Nada pendurado: pode ir. Soft-delete — a linha some da RLS, e o
    -- `is_active = false` é aplicado pelo trigger.
    update public.category
       set deleted_at = now()
     where id = p_category_id
       and profile_id = v_perfil;
    return 'deleted';
  end if;

  -- Tem algo pendurado: DESATIVA a subárvore inteira.
  --
  -- A subárvore inteira, e não só a mãe: uma mãe inativa com filhas ativas
  -- deixaria as filhas sem caminho até elas na tela — presentes no banco,
  -- invisíveis para quem usa. Some tudo junto, e volta tudo junto (4.6).
  update public.category
     set is_active = false
   where id = any (v_ids)
     and profile_id = v_perfil;

  return 'deactivated';
end;
$$;

-- --- 4.6 A volta ---------------------------------------------------------
-- Reativar uma categoria desativada. O caminho de volta do submenu.
--
-- Mexe em DOIS sentidos, e os dois são necessários:
--   • PARA BAIXO — a subárvore inteira, porque foi assim que ela saiu (4.5);
--   • PARA CIMA  — a cadeia de mães, porque uma categoria ativa pendurada numa
--     mãe inativa continuaria invisível na árvore. Reativar sem subir devolveria
--     à pessoa uma categoria que "voltou" e que ela não consegue encontrar.
create or replace function public.category_reactivate(p_category_id int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil int := public.current_profile_id();
begin
  if not exists (
    select 1 from public.category c
     where c.id = p_category_id
       and c.profile_id = v_perfil
       and c.deleted_at is null
  ) then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;

  with recursive maes as (
    select c.id, c.parent_id
      from public.category c
     where c.id = p_category_id
    union all
    select m.id, m.parent_id
      from public.category m
      join maes on m.id = maes.parent_id
  )
  update public.category alvo
     set is_active = true
   where alvo.profile_id = v_perfil
     and alvo.deleted_at is null
     and (alvo.id in (select maes.id from maes)
       or alvo.id in (select s.id from public.category_subtree(p_category_id) s));
end;
$$;


-- -------------------------------------------------------------------------
-- 5. RLS + policies
-- -------------------------------------------------------------------------
alter table public.category enable row level security;

-- `deleted_at is null` entra nas policies, e não só nas queries do front: assim
-- "excluída sumiu" é uma garantia do BANCO, não uma convenção que alguém pode
-- esquecer de repetir na próxima tela (ou no Chat, ou no Log da IA).
drop policy if exists category_select_own on public.category;
create policy category_select_own on public.category
  for select to authenticated
  using (profile_id = public.current_profile_id() and deleted_at is null);

drop policy if exists category_insert_own on public.category;
create policy category_insert_own on public.category
  for insert to authenticated
  with check (profile_id = public.current_profile_id());

drop policy if exists category_update_own on public.category;
create policy category_update_own on public.category
  for update to authenticated
  using (profile_id = public.current_profile_id() and deleted_at is null)
  with check (profile_id = public.current_profile_id());

-- Sem policy de DELETE, de propósito: a saída é o soft-delete de
-- `category_remove()`. Um DELETE de verdade cascatearia a subárvore inteira pela
-- FK e, no futuro, levaria junto o histórico que apontasse para ela.


-- -------------------------------------------------------------------------
-- 6. Grants (menor privilégio)
-- -------------------------------------------------------------------------
-- A RLS diz QUAIS LINHAS; o grant de coluna diz QUAIS COLUNAS. Aqui é o segundo
-- que importa: sem ele, o dono da própria linha poderia mandar
-- `is_active = true` ou `deleted_at = null` direto pela API REST e desfazer
-- qualquer regra das RPCs acima — inclusive reativar uma filha sozinha e deixar
-- a árvore incoerente. Com o grant recortado, `is_active` e `deleted_at` só
-- mudam por `category_remove` / `category_reactivate`, que são `security
-- definer` e rodam como dono da tabela.
--
-- `profile_id` também fica de fora: quem o preenche é o DEFAULT.
revoke all on public.category from anon, authenticated;
grant select                            on public.category to authenticated;
grant insert (name, color, parent_id)   on public.category to authenticated;
grant update (name, color, parent_id)   on public.category to authenticated;

-- Função de trigger: ninguém chama à mão.
revoke execute on function public.category_guard() from public, anon, authenticated;

-- Internas das RPCs. Não são expostas: as funções de 4.4–4.6 são `security
-- definer` e as chamam como DONAS, então o cliente não precisa de execute aqui.
revoke execute on function public.category_subtree(int)              from public, anon, authenticated;
revoke execute on function public.category_linked_records(int[])     from public, anon, authenticated;
revoke execute on function public.category_action_for(int, int)      from public, anon, authenticated;

-- O que a tela chama: só quem está logado.
revoke execute on function public.category_impact(int)     from public, anon;
grant  execute on function public.category_impact(int)     to authenticated;

revoke execute on function public.category_remove(int)     from public, anon;
grant  execute on function public.category_remove(int)     to authenticated;

revoke execute on function public.category_reactivate(int) from public, anon;
grant  execute on function public.category_reactivate(int) to authenticated;

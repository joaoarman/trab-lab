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

-- --- public.category -----------------------------------------------------

-- -------------------------------------------------------------------------
-- category_guard — a guarda de integridade da árvore (trigger de escrita).
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

-- -------------------------------------------------------------------------
-- category_subtree — a categoria e todos os seus descendentes vivos.
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

-- -------------------------------------------------------------------------
-- category_linked_records — quantos lançamentos apontam para estas categorias.
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

-- -------------------------------------------------------------------------
-- category_action_for — "exclui ou desativa?", numa função só.
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

-- -------------------------------------------------------------------------
-- category_impact — a prévia que alimenta a modal de confirmação.
-- O que ACONTECERIA se a categoria fosse excluída agora. A tela chama isto ao
-- abrir a confirmação, para dizer a verdade em vez de um texto genérico:
-- "3 subcategorias vão junto para Desativadas" é uma frase diferente de
-- "esta categoria será excluída".
--
-- É só uma PRÉVIA: quem decide de fato é category_remove, ao agir.
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

-- -------------------------------------------------------------------------
-- category_remove — excluir (soft-delete) ou, quando não dá, desativar.
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
  -- invisíveis para quem usa. Some tudo junto, e volta tudo junto (category_reactivate).
  update public.category
     set is_active = false
   where id = any (v_ids)
     and profile_id = v_perfil;

  return 'deactivated';
end;
$$;

-- -------------------------------------------------------------------------
-- category_reactivate — o caminho de volta do submenu "Desativadas".
-- Reativar uma categoria desativada. O caminho de volta do submenu.
--
-- Mexe em DOIS sentidos, e os dois são necessários:
--   • PARA BAIXO — a subárvore inteira, porque foi assim que ela saiu (category_remove);
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



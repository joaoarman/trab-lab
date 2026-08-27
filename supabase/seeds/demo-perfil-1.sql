-- demo-perfil-1.sql
--
-- Dados de demonstração de UM perfil: a árvore de categorias inteira, os gastos
-- dos últimos meses e as receitas do mesmo período. Serve para abrir o sistema
-- com o extrato cheio — na apresentação da disciplina e ao mexer nas telas.
--
-- NÃO é uma migration: não muda o schema e não entra no full_schema.sql.
-- Copiar e colar no SQL Editor do Supabase.
--
-- ATENÇÃO: com v_limpar = true (o padrão), APAGA todas as categorias, gastos e
-- receitas do perfil antes de semear. Ponha false se o perfil tiver dado real.

do $$
declare
  -- --- Os três botões desta seed -----------------------------------------
  v_perfil  constant int     := 1;
  v_meses   constant int     := 3;
  v_limpar  constant boolean := true;
  v_fuso    constant text    := 'America/Sao_Paulo';

  v_dia_fim date := (now() at time zone v_fuso)::date;
  v_dia_ini date;
  v_de      timestamptz;
  v_ate     timestamptz := now();

  -- --- Categorias: topo ---------------------------------------------------
  v_carro int; v_assin int; v_saude int; v_casa int; v_alim int;
  v_transp int; v_educ int; v_lazer int; v_vest int; v_presentes int;

  -- --- Carro ---------------------------------------------------------------
  v_car_imp int; v_car_gas int; v_car_man int; v_car_seg int; v_car_est int;
  v_man_rev int; v_man_pneu int; v_man_oleo int;

  -- --- Assinaturas ---------------------------------------------------------
  v_ass_cloud int; v_ass_gpt int; v_ass_cursor int; v_ass_vps int;
  v_ass_supa int; v_ass_resend int; v_ass_stream int;

  -- --- Saúde ---------------------------------------------------------------
  v_sau_acad int; v_sau_nat int; v_sau_fut int; v_sau_sup int;
  v_sau_farm int; v_sau_cons int;
  v_sup_whey int; v_sup_crea int; v_sup_pre int;

  -- --- Casa ----------------------------------------------------------------
  v_casa_sup int; v_casa_con int; v_casa_alu int; v_casa_man int;
  v_con_luz int; v_con_agua int; v_con_net int; v_con_gas int;

  -- --- Os demais topos -----------------------------------------------------
  v_ali_rest int; v_ali_deli int; v_ali_pad int;
  v_tra_app int; v_tra_pub int; v_tra_pas int;
  v_edu_cur int; v_edu_liv int; v_edu_mat int;
  v_laz_cine int; v_laz_bar int; v_laz_jogo int; v_laz_viag int;
  v_ves_rou int; v_ves_cal int;

  v_gastos int; v_receitas int; v_cats int;
begin
  v_dia_ini := (v_dia_fim - make_interval(months => v_meses))::date;
  v_de      := (v_dia_ini + time '00:00') at time zone v_fuso;

  if not exists (select 1 from public.profile p where p.id = v_perfil) then
    raise exception 'O perfil % nao existe. Crie a conta antes de rodar a seed.', v_perfil;
  end if;

  if v_limpar then
    delete from public.expense  where profile_id = v_perfil;
    delete from public.income   where profile_id = v_perfil;
    delete from public.category where profile_id = v_perfil;
  end if;

  -- =======================================================================
  -- 1. A árvore de categorias
  -- =======================================================================
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, null, 'Carro',        '#f97316') returning id into v_carro;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, null, 'Assinaturas',  '#8b5cf6') returning id into v_assin;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, null, 'Saúde',        '#ef4444') returning id into v_saude;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, null, 'Casa',         '#0ea5e9') returning id into v_casa;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, null, 'Alimentação',  '#f59e0b') returning id into v_alim;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, null, 'Transporte',   '#14b8a6') returning id into v_transp;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, null, 'Educação',     '#6366f1') returning id into v_educ;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, null, 'Lazer',        '#ec4899') returning id into v_lazer;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, null, 'Vestuário',    '#a855f7') returning id into v_vest;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, null, 'Presentes',    '#eab308') returning id into v_presentes;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_carro, 'Impostos',                 '#fb923c') returning id into v_car_imp;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_carro, 'Gasolina',                 '#f97316') returning id into v_car_gas;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_carro, 'Manutenção',               '#ea580c') returning id into v_car_man;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_carro, 'Seguro',                   '#fdba74') returning id into v_car_seg;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_carro, 'Estacionamento e pedágio', '#fed7aa') returning id into v_car_est;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_car_man, 'Revisão',        '#ea580c') returning id into v_man_rev;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_car_man, 'Pneus',          '#c2410c') returning id into v_man_pneu;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_car_man, 'Óleo e filtros', '#9a3412') returning id into v_man_oleo;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_assin, 'Cloud',         '#a78bfa') returning id into v_ass_cloud;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_assin, 'GPT',           '#8b5cf6') returning id into v_ass_gpt;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_assin, 'Cursor',        '#7c3aed') returning id into v_ass_cursor;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_assin, 'VPS Hostinger', '#6d28d9') returning id into v_ass_vps;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_assin, 'Supabase',      '#5b21b6') returning id into v_ass_supa;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_assin, 'Resend',        '#c4b5fd') returning id into v_ass_resend;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_assin, 'Streaming',     '#ddd6fe') returning id into v_ass_stream;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_saude, 'Academia',           '#f87171') returning id into v_sau_acad;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_saude, 'Natação',            '#38bdf8') returning id into v_sau_nat;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_saude, 'Futebol',            '#4ade80') returning id into v_sau_fut;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_saude, 'Suplementos',        '#dc2626') returning id into v_sau_sup;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_saude, 'Farmácia',           '#fca5a5') returning id into v_sau_farm;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_saude, 'Consultas e exames', '#b91c1c') returning id into v_sau_cons;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_sau_sup, 'Whey',       '#dc2626') returning id into v_sup_whey;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_sau_sup, 'Creatina',   '#991b1b') returning id into v_sup_crea;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_sau_sup, 'Pré-treino', '#7f1d1d') returning id into v_sup_pre;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_casa, 'Supermercado', '#38bdf8') returning id into v_casa_sup;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_casa, 'Contas',       '#0ea5e9') returning id into v_casa_con;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_casa, 'Aluguel',      '#0284c7') returning id into v_casa_alu;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_casa, 'Manutenção',   '#075985') returning id into v_casa_man;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_casa_con, 'Luz',      '#facc15') returning id into v_con_luz;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_casa_con, 'Água',     '#22d3ee') returning id into v_con_agua;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_casa_con, 'Internet', '#0ea5e9') returning id into v_con_net;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_casa_con, 'Gás',      '#fb923c') returning id into v_con_gas;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_alim, 'Restaurantes',   '#f59e0b') returning id into v_ali_rest;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_alim, 'Delivery',       '#d97706') returning id into v_ali_deli;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_alim, 'Padaria e café', '#fbbf24') returning id into v_ali_pad;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_transp, 'Aplicativos',        '#2dd4bf') returning id into v_tra_app;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_transp, 'Transporte público', '#14b8a6') returning id into v_tra_pub;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_transp, 'Passagens',          '#0f766e') returning id into v_tra_pas;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_educ, 'Cursos',   '#818cf8') returning id into v_edu_cur;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_educ, 'Livros',   '#6366f1') returning id into v_edu_liv;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_educ, 'Material', '#4f46e5') returning id into v_edu_mat;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_lazer, 'Cinema',  '#f472b6') returning id into v_laz_cine;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_lazer, 'Bares',   '#ec4899') returning id into v_laz_bar;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_lazer, 'Jogos',   '#db2777') returning id into v_laz_jogo;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_lazer, 'Viagens', '#be185d') returning id into v_laz_viag;

  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_vest, 'Roupas',   '#a855f7') returning id into v_ves_rou;
  insert into public.category (profile_id, parent_id, name, color) values
    (v_perfil, v_vest, 'Calçados', '#9333ea') returning id into v_ves_cal;

  -- =======================================================================
  -- 2. Gastos mensais de valor fixo (assinaturas, mensalidades, aluguel)
  --
  -- Uma linha por mês do recorte, no dia combinado. O que está em USD guarda a
  -- cotação do mês, como o sistema exige de toda moeda estrangeira.
  -- =======================================================================
  insert into public.expense (profile_id, category_id, name, amount, currency, exchange_rate, occurred_at, created_at)
  select v_perfil, r.cat, r.nome, r.valor, r.moeda::public.currency,
         case when r.moeda = 'BRL' then null else q.cotacao end,
         q.quando, q.quando
    from (values
      (v_ass_gpt,     'ChatGPT Plus',                    20.00, 'USD'::text,  4, '09:05'::time),
      (v_ass_cursor,  'Cursor Pro',                      20.00, 'USD',       11, '09:10'),
      (v_ass_supa,    'Supabase Pro',                    25.00, 'USD',        8, '09:15'),
      (v_ass_resend,  'Resend Pro',                      20.00, 'USD',       14, '09:20'),
      (v_ass_cloud,   'Cloudflare Workers',               5.00, 'USD',        6, '09:35'),
      (v_ass_vps,     'VPS Hostinger KVM 2',             39.99, 'BRL',        2, '09:25'),
      (v_ass_cloud,   'Google One 200 GB',                9.99, 'BRL',        6, '09:30'),
      (v_ass_stream,  'Netflix',                         44.90, 'BRL',       12, '20:10'),
      (v_ass_stream,  'Spotify',                         21.90, 'BRL',       17, '20:15'),
      (v_ass_stream,  'YouTube Premium',                 24.90, 'BRL',       21, '20:20'),
      (v_sau_acad,    'Smart Fit — mensalidade',        119.90, 'BRL',        5, '07:20'),
      (v_sau_nat,     'Natação — mensalidade',          180.00, 'BRL',        5, '07:25'),
      (v_sau_fut,     'Futebol — mensalidade da quadra', 80.00, 'BRL',        3, '21:30'),
      (v_con_net,     'Internet fibra 500 mega',         99.90, 'BRL',       10, '10:00'),
      (v_casa_alu,    'Aluguel',                       1200.00, 'BRL',       10, '10:05'),
      (v_car_seg,     'Seguro do carro — parcela',      214.30, 'BRL',       15, '10:10'),
      (v_edu_cur,     'Alura — mensalidade',             89.00, 'BRL',       18, '19:00'),
      (v_tra_pub,     'Recarga do cartão do ônibus',     60.00, 'BRL',        7, '07:05')
    ) as r(cat, nome, valor, moeda, dia, hora)
    cross join generate_series(
      date_trunc('month', v_dia_ini::timestamp),
      date_trunc('month', v_dia_fim::timestamp),
      interval '1 month'
    ) as g(mes)
    cross join lateral (
      select ((g.mes::date + (r.dia - 1)) + r.hora) at time zone v_fuso as quando,
             round(5.15 + ((extract(month from g.mes)::int * 11) % 13) * 0.025, 4) as cotacao
    ) as q
   where q.quando between v_de and v_ate;

  -- =======================================================================
  -- 3. Contas de consumo — mensais, mas o valor oscila
  --
  -- O valor sai de uma conta determinística sobre o número do mês: a seed
  -- rodada duas vezes produz o mesmo extrato, e ainda assim nenhuma conta de
  -- luz é igual à do mês anterior.
  -- =======================================================================
  insert into public.expense (profile_id, category_id, name, amount, currency, occurred_at, created_at)
  select v_perfil, r.cat, r.nome,
         round(r.vmin + (r.vmax - r.vmin) * q.ruido, 2), 'BRL',
         q.quando, q.quando
    from (values
      (v_con_luz,  'Conta de luz',   128.00, 246.00, 16, '10:20'::time,  3),
      (v_con_agua, 'Conta de água',   68.00, 112.00, 19, '10:25',        7),
      (v_con_gas,  'Gás encanado',    46.00,  88.00, 22, '10:30',       11)
    ) as r(cat, nome, vmin, vmax, dia, hora, semente)
    cross join generate_series(
      date_trunc('month', v_dia_ini::timestamp),
      date_trunc('month', v_dia_fim::timestamp),
      interval '1 month'
    ) as g(mes)
    cross join lateral (
      select ((g.mes::date + (r.dia - 1)) + r.hora) at time zone v_fuso as quando,
             ((((extract(year from g.mes)::int * 12 + extract(month from g.mes)::int + r.semente)::bigint
                * 9301 + 49297) % 233280)::numeric / 233280) as ruido
    ) as q
   where q.quando between v_de and v_ate;

  -- =======================================================================
  -- 4. O dia a dia — gastos que se repetem a cada N dias
  --
  -- Cada definição diz de quantos em quantos dias acontece, em que faixa de
  -- valor e com que nomes. O nome, o valor e o minuto saem da mesma conta
  -- determinística, então o extrato varia sem nunca mudar entre duas rodadas.
  -- =======================================================================
  insert into public.expense (profile_id, category_id, name, amount, currency, occurred_at, created_at)
  select v_perfil, r.cat,
         r.nomes[1 + (i.ordem * 7 + r.semente) % array_length(r.nomes, 1)],
         round(r.vmin + (r.vmax - r.vmin) * q.ruido, 2), 'BRL',
         q.quando, q.quando
    from (values
      (v_casa_sup,  7,  2, 168.00, 438.00, '18:40'::time,  5,
       array['Zaffari — compra da semana', 'Nacional — compra da semana',
             'Atacadão — compra do mês', 'Comper — compra da semana', 'Big — feira e limpeza']),
      (v_car_gas,   9,  4,  92.00, 287.00, '08:15',       13,
       array['Posto Ipiranga', 'Posto Shell', 'Posto BR', 'Posto Ale']),
      (v_ali_rest,  4,  1,  26.00,  98.00, '12:30',       21,
       array['Almoço no centro', 'Restaurante japonês', 'Churrascaria',
             'Almoço com a equipe', 'Pizzaria']),
      (v_ali_deli,  8,  5,  31.00,  86.00, '20:45',       29,
       array['iFood — jantar', 'iFood — lanche da madrugada', 'Rappi — jantar']),
      (v_ali_pad,   3,  0,   7.50,  34.00, '07:40',       37,
       array['Padaria da esquina', 'Café da manhã', 'Cafeteria do centro']),
      (v_tra_app,   5,  3,  11.00,  47.00, '18:10',       41,
       array['Uber para a faculdade', '99 para casa', 'Uber para o centro']),
      (v_laz_bar,  12,  6,  38.00, 145.00, '21:00',       53,
       array['Bar com os amigos', 'Happy hour', 'Cervejaria']),
      (v_laz_cine, 26,  9,  32.00,  68.00, '19:30',       61,
       array['Cinema', 'Cinema — sessão dupla']),
      (v_sau_farm, 13,  8,  18.00,  96.00, '17:20',       67,
       array['Farmácia — remédio', 'Farmácia — protetor solar', 'Drogaria']),
      (v_car_est,  10,  7,   8.00,  35.00, '14:05',       71,
       array['Estacionamento do centro', 'Pedágio', 'Estacionamento do shopping']),
      (v_laz_jogo, 30, 14,  39.00, 199.00, '22:10',       83,
       array['Steam — jogo novo', 'Steam — DLC']),
      (v_edu_mat,  21, 11,  12.00,  68.00, '16:00',       89,
       array['Impressões da faculdade', 'Caderno e canetas', 'Material de aula']),
      (v_sup_whey, 45,  5, 179.90, 219.90, '11:15',       97,
       array['Whey protein 900 g']),
      (v_sup_crea, 60, 12,  79.90, 109.90, '11:20',      101,
       array['Creatina 300 g']),
      (v_sup_pre,  50, 20, 109.90, 149.90, '11:25',      103,
       array['Pré-treino 300 g'])
    ) as r(cat, passo, desloc, vmin, vmax, hora, semente, nomes)
    cross join lateral generate_series(
      (v_dia_ini + r.desloc)::timestamp,
      v_dia_fim::timestamp,
      make_interval(days => r.passo)
    ) as g(d)
    cross join lateral (
      select (g.d::date - v_dia_ini) as n,
             (g.d::date - v_dia_ini - r.desloc) / r.passo as ordem
    ) as i
    cross join lateral (
      select i.n,
             (g.d::date + (r.hora + make_interval(mins => ((i.n + r.semente) * 13) % 50)))
               at time zone v_fuso as quando,
             ((((i.n + r.semente)::bigint * 9301 + 49297) % 233280)::numeric / 233280) as ruido
    ) as q
   where q.quando between v_de and v_ate;

  -- =======================================================================
  -- 5. Gastos pontuais — o que acontece uma vez só
  --
  -- `dias` é quantos dias atrás, contados de hoje. As três últimas linhas são
  -- de propósito SEM CATEGORIA: é um caso real do sistema, e as telas precisam
  -- ter o que mostrar nele.
  -- =======================================================================
  insert into public.expense (profile_id, category_id, name, amount, currency, exchange_rate, occurred_at, created_at)
  select v_perfil, r.cat, r.nome, r.valor, r.moeda::public.currency,
         case when r.moeda = 'BRL' then null else r.cotacao end,
         q.quando, q.quando
    from (values
      (v_car_imp,   'IPVA 2026 — parcela 4/6',                    412.00, 'BRL'::text, null::numeric, 82, '10:40'::time),
      (v_car_imp,   'IPVA 2026 — parcela 5/6',                    412.00, 'BRL', null,               52, '10:40'),
      (v_car_imp,   'IPVA 2026 — parcela 6/6',                    412.00, 'BRL', null,               22, '10:40'),
      (v_car_imp,   'Licenciamento 2026',                         178.51, 'BRL', null,               74, '11:00'),
      (v_man_rev,   'Revisão dos 40.000 km',                      780.00, 'BRL', null,               63, '09:00'),
      (v_man_pneu,  'Dois pneus dianteiros',                     1180.00, 'BRL', null,               41, '15:30'),
      (v_man_oleo,  'Troca de óleo e filtro',                     268.00, 'BRL', null,               12, '09:45'),
      (v_car_man,   'Alinhamento e balanceamento',                160.00, 'BRL', null,               40, '16:20'),
      (v_casa_man,  'Conserto da máquina de lavar',               320.00, 'BRL', null,               55, '14:10'),
      (v_casa_man,  'Chuveiro novo',                              189.90, 'BRL', null,               29, '17:05'),
      (v_sau_cons,  'Consulta com o dermatologista',              250.00, 'BRL', null,               68, '08:30'),
      (v_sau_cons,  'Exames de sangue',                           187.40, 'BRL', null,               61, '07:15'),
      (v_sau_cons,  'Consulta com o dentista',                    210.00, 'BRL', null,               24, '15:00'),
      (v_edu_liv,   'Clean Architecture — Robert C. Martin',       89.90, 'BRL', null,               77, '20:30'),
      (v_edu_liv,   'Designing Data-Intensive Applications',      219.00, 'BRL', null,               35, '20:30'),
      (v_edu_cur,   'Curso de PostgreSQL',                        197.00, 'BRL', null,               50, '21:15'),
      (v_laz_viag,  'Pousada em Gramado — 2 diárias',             640.00, 'BRL', null,               44, '13:00'),
      (v_laz_viag,  'Ingressos do parque',                        180.00, 'BRL', null,               43, '10:15'),
      (v_tra_pas,   'Passagem de ônibus para Porto Alegre',        78.60, 'BRL', null,               58, '06:40'),
      (v_tra_pas,   'Passagem de volta',                           78.60, 'BRL', null,               56, '19:50'),
      (v_ves_rou,   'Duas camisetas',                             129.80, 'BRL', null,               71, '16:45'),
      (v_ves_rou,   'Calça jeans',                                199.90, 'BRL', null,               33, '16:50'),
      (v_ves_cal,   'Tênis de corrida',                           459.90, 'BRL', null,               19, '11:40'),
      (v_presentes, 'Presente de aniversário da mãe',             180.00, 'BRL', null,               65, '18:20'),
      (v_presentes, 'Presente de aniversário do irmão',           120.00, 'BRL', null,               27, '18:25'),
      (v_ass_cloud, 'Domínio selfos.com.br — renovação',           59.90, 'BRL', null,               72, '09:50'),
      (v_ass_gpt,   'Créditos da API da OpenAI',                   15.00, 'USD', 5.3120,             30, '22:05'),
      (v_ass_gpt,   'Créditos da API da OpenAI',                   10.00, 'USD', 5.2840,              9, '22:10'),
      (v_ali_rest,  'Jantar de aniversário',                      240.00, 'BRL', null,               27, '20:40'),
      (null,        'Rifa do time de futebol',                     20.00, 'BRL', null,               39, '19:10'),
      (null,        'Cópia da chave de casa',                      35.00, 'BRL', null,               52, '15:20'),
      (null,        'Gorjeta do entregador',                       10.00, 'BRL', null,               21, '21:05'),
      (v_casa_sup,  'Zaffari — compra da semana',                 214.30, 'BRL', null,                1, '19:00'),
      (v_car_gas,   'Posto Ipiranga',                             180.00, 'BRL', null,                0, '07:50'),
      (v_ali_pad,   'Café da manhã',                               14.50, 'BRL', null,                0, '08:10'),
      (v_ali_rest,  'Almoço no centro',                            42.00, 'BRL', null,                0, '12:20')
    ) as r(cat, nome, valor, moeda, cotacao, dias, hora)
    cross join lateral (
      -- `least` para o lançamento de hoje não cair no futuro se a seed rodar de manhã.
      select least(((v_dia_fim - r.dias) + r.hora) at time zone v_fuso,
                   v_ate - interval '5 minutes') as quando
    ) as q
   where q.quando between v_de and v_ate;

  -- =======================================================================
  -- 6. Receitas
  --
  -- Sem categoria, por projeto do módulo: o nome é o único descritor. As fixas
  -- são o salário e as mensalidades dos sistemas; os freelas são pontuais, e um
  -- deles em dólar, para o extrato ter também receita convertida.
  -- =======================================================================
  insert into public.income (profile_id, name, amount, currency, received_at, created_at)
  select v_perfil, r.nome, r.valor, 'BRL', q.quando, q.quando
    from (values
      ('Salário',                                     5400.00,  5, '09:30'::time),
      ('Mensalidade do sistema — Clínica Vida',        350.00, 10, '10:00'),
      ('Mensalidade do sistema — Barbearia do Léo',    180.00, 10, '10:05'),
      ('Mensalidade do sistema — Pet shop Auau',       220.00, 15, '10:10'),
      ('Mensalidade do sistema — Studio Pilates',      280.00, 20, '10:15')
    ) as r(nome, valor, dia, hora)
    cross join generate_series(
      date_trunc('month', v_dia_ini::timestamp),
      date_trunc('month', v_dia_fim::timestamp),
      interval '1 month'
    ) as g(mes)
    cross join lateral (
      select ((g.mes::date + (r.dia - 1)) + r.hora) at time zone v_fuso as quando
    ) as q
   where q.quando between v_de and v_ate;

  insert into public.income (profile_id, name, amount, currency, exchange_rate, received_at, created_at)
  select v_perfil, r.nome, r.valor, r.moeda::public.currency,
         case when r.moeda = 'BRL' then null else r.cotacao end,
         q.quando, q.quando
    from (values
      ('Freelance — landing page da imobiliária',      1500.00, 'BRL'::text, null::numeric, 74, '17:00'::time),
      ('Freelance — integração com a API dos Correios', 980.00, 'BRL', null,               63, '16:30'),
      ('Freelance — app de agendamento',               2800.00, 'BRL', null,               52, '18:00'),
      ('Venda de um monitor usado',                     380.00, 'BRL', null,               45, '14:20'),
      ('Freelance — manutenção do sistema do cliente',   400.00, 'USD', 5.2960,            38, '11:30'),
      ('Bônus do projeto entregue',                     700.00, 'BRL', null,               30, '13:45'),
      ('Venda do sistema de ponto de venda',           3500.00, 'BRL', null,               20, '15:10'),
      ('Freelance — ajuste no site institucional',       450.00, 'BRL', null,               11, '19:20')
    ) as r(nome, valor, moeda, cotacao, dias, hora)
    cross join lateral (
      select ((v_dia_fim - r.dias) + r.hora) at time zone v_fuso as quando
    ) as q
   where q.quando between v_de and v_ate;

  -- =======================================================================
  -- 7. O que foi semeado
  -- =======================================================================
  select count(*) into v_cats     from public.category where profile_id = v_perfil;
  select count(*) into v_gastos   from public.expense  where profile_id = v_perfil;
  select count(*) into v_receitas from public.income   where profile_id = v_perfil;

  raise notice 'Perfil %: % categorias, % gastos e % receitas, de % ate %.',
    v_perfil, v_cats, v_gastos, v_receitas, v_dia_ini, v_dia_fim;
end
$$;

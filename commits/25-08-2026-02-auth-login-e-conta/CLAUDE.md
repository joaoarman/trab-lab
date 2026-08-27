# 02 · Auth — login, cadastro e minha conta

**Data:** 25/08/2026

**Resumo:** O login do Self OS de ponta a ponta — tabela `profile` com RLS por
dono, telas de entrar/criar conta fora do shell, guarda de rota (deslogado não
acessa nada) e a tela de conta com foto, troca de senha e troca de e-mail. As
rotas dos módulos passaram a ser nomeadas em inglês.

**Commit:** `feat: implementar autenticação com perfil, guarda de rota e tela de conta`

## O que foi feito

O sistema tinha um shell navegável e cinco placeholders **sem porta de entrada**.
Agora tem: cada pessoa cria a própria conta, e todo dado do sistema passa a ter
um dono — é o `profile.id` que gastos, receitas, categorias e chat vão
referenciar daqui em diante.

### Decisões de escopo (do usuário, na entrevista)

Estas **não são pendências esquecidas**; são o recorte escolhido para o trabalho
da disciplina. Cada uma tem o caminho de volta no `PENDENCIAS.md`:

- **Confirmação de e-mail desligada** → a conta nasce confirmada, o `signUp` já
  devolve a sessão e **o sistema não envia e-mail nenhum**.
- **Sem "esqueci a senha"** → é consequência da anterior (não há SMTP). Por isso
  o cadastro pede a senha **duas vezes**: um erro de digitação aqui não é um
  contratempo, é a conta perdida.
- **Sem CAPTCHA, sem login com Google, sem excluir conta pelo app.**

### Decisões técnicas que valem para os próximos módulos

- **PK inteira + `auth_uuid` à parte.** `profile.id int identity` é o que todo o
  resto do sistema referencia; o uuid do Supabase Auth fica preso na `profile` e
  não sai de lá.
- **`current_profile_id()` é o helper de RLS de todo módulo futuro** —
  `using (profile_id = public.current_profile_id())`. Ele filtra
  `deleted_at is null`, então **desativar uma conta já fecha o acesso a todas as
  tabelas** sem escrever uma policy a mais em cada uma.
- **RLS diz quais linhas; grant de coluna diz quais colunas.** São proteções
  diferentes: sem a segunda, o dono da própria linha reescreveria o e-mail
  espelhado ou "reviveria" a conta zerando `deleted_at`.
- **Dinheiro ainda não entrou, mas o padrão do `.eq('id', …)` sim**: o safeupdate
  do PostgREST recusa `UPDATE` sem filtro (erro `21000`).

### Front-end

- **Módulo `Auth`** (`/login`, `/signup`) — fora do `AppLayout`, com o `AuthShell`
  trazendo a própria cópia dos controles de tema e idioma (sem ela, quem prefere
  o app em inglês teria que se cadastrar em português).
- **Módulo `Account`** (`/account`) — dois cards: **Perfil** (foto + nome, num
  "Salvar" só, com aviso âmbar de "não salvas") e **Segurança** (e-mail e senha,
  cada um exigindo a senha atual e perguntando o que fazer com as outras sessões).
- **Foto de perfil com recorte** (`react-easy-crop`): sai sempre um JPEG quadrado
  de 512px, num caminho fixo por usuário — trocar é `upsert`, e o bucket nunca
  guarda foto órfã.
- **`AuthContext`** (`shared/context`) — sessão + perfil + sair. Derruba a sessão
  quando a renovação do token falha e **em todos os aparelhos** quando o perfil
  vem com `deleted_at`: o ban no Supabase não invalida um token já emitido.
- **Guardas de rota** (`RotaProtegida` / `RotaPublica`) — deslogado não acessa
  nada; as telas de login e cadastro **não navegam sozinhas** (quem decide o
  destino é a guarda, reagindo à sessão, para as duas não correrem entre si).
- **Rotas renomeadas para inglês**: `/gastos` → `/expenses`, `/receitas` →
  `/income`, `/categorias` → `/categories`, `/log` → `/ai-log`. Os rótulos
  visíveis continuam vindo do i18n, então a URL não é o que o usuário lê.
- **Primitivos novos** em `shared/components/ui/`: `alert` (a variante `warning`),
  `password-input` (olho de ver/ocultar + indicador de Caps Lock) e `sonner`.
- **Compartilhados novos**: `PerfilAvatar` (a foto do usuário, usada pelo menu do
  shell **e** pela tela de conta) e `PasswordRequirements` (a régua da senha, que
  precisa dizer a mesma coisa que o `password_requirements` do `config.toml`).
- **Tema**: entrou o token `--warning` nos **dois** temas — é uma quarta cor de
  estado porque as outras três já significam outra coisa (`--destructive` é
  perigo, `--expense` é dinheiro que sai, `--primary` convida a clicar).
- **i18n**: os blocos `common`, `auth` e `account` nos dois idiomas. Nenhum texto
  de UI fixo.
- **`public/.htaccess`**: CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` e o
  rewrite da SPA. A CSP é **cabeçalho HTTP e não `<meta>`** — `frame-ancestors` é
  ignorado numa meta tag, e uma CSP no `index.html` quebraria o HMR do Vite e o
  script anti-flash do tema.

### Banco de dados (Supabase)

Tudo em `supabase/migrations/20260825184944_auth-perfil-e-avatar.sql` (e em
`run.sql`, nesta pasta).

- **Tabela `public.profile`** — `id int identity` PK, `auth_uuid uuid unique →
  auth.users(id)`, `full_name`, `email` (espelho), `avatar_path` (caminho, **não**
  URL), `deleted_at` (soft-delete), `created_at`/`updated_at`.
- **Triggers em `auth.users`**:
  - `on_auth_user_created` — cria o perfil no cadastro. **Engole exceções de
    propósito**: um erro aqui derrubaria a transação de cadastro do GoTrue com um
    "Database error saving new user" ilegível. Prefere-se conta sem perfil (que o
    app repara) a pessoa que não consegue se cadastrar.
  - `on_auth_user_confirmed` — a mesma função, para o dia em que a confirmação de
    e-mail for religada. Já está pronto.
  - `on_auth_user_email_updated` — espelha `auth.users.email` em `profile.email`.
- **Trigger `on_profile_before_update`** — recusa o cliente alterando
  `auth_uuid`, `email`, `deleted_at` ou `created_at`, e mantém o `updated_at`.
- **Functions** (todas `security definer` com `set search_path = ''`):
  `handle_new_user`, `handle_user_email_update`, `profile_guard_and_touch`,
  `current_profile_id`, `ensure_profile`, `email_available`.
- **RLS**: `profile_select_own` e `profile_update_own` (`auth.uid() = auth_uuid`).
  **Sem policy de INSERT** (quem cria o perfil é o trigger) e **sem DELETE** (a
  saída é o soft-delete).
- **Grants**: `revoke all` de `anon`/`authenticated`; `select` para
  `authenticated`; **`update` só em `full_name` e `avatar_path`**. Nas functions,
  `revoke execute from public, anon` + grant pontual — `email_available` **não é
  exposta a `anon`**, senão viraria um endereço público para descobrir quem tem
  conta no sistema.
- **Storage**: bucket `avatars` público para leitura, 2 MB, jpeg/png/webp. A
  policy prende a escrita à pasta `auth.uid()`. A pasta é o **`auth_uuid` e não o
  `id`** justamente porque a leitura é pública: `1/avatar.jpg`, `2/avatar.jpg`…
  se percorreria em minutos.

### Mudanças de acesso

Antes: **não havia autenticação** — qualquer pessoa com a URL via todas as telas,
e o banco não tinha tabela alguma. Agora:

- **`anon`** não lê nem executa nada em `public`. As únicas rotas alcançáveis sem
  sessão são `/login` e `/signup`.
- **`authenticated`** lê e altera **só a própria linha de `profile`**, e só nas
  colunas `full_name` e `avatar_path`.
- **Conta desativada** (`deleted_at`) perde o acesso a todo módulo futuro pelo
  `current_profile_id()`, e tem a sessão derrubada em todos os aparelhos pelo app.

## Configuração de projeto (fora do SQL)

`supabase/config.toml` foi escrito do zero: `site_url`/`additional_redirect_urls`
travados sem curinga, `enable_confirmations = false`, senha mínima de 6 com
`lower_upper_letters_digits_symbols`, e os `[auth.rate_limit]` declarados. Aplica
com **`supabase config push`** — revisando o diff, porque o push aplica a config
inteira e o que não estiver declarado volta ao padrão do CLI.

## O que ainda falta rodar

1. Colar o `run.sql` no **SQL Editor** e executar.
2. `supabase config push` (o `supabase link` já foi feito).

O passo a passo completo, com o roteiro de teste, está documentado à parte.

# Pendências

> O que ficou **de fora de propósito**, por que fica, e **exatamente o que fazer**
> para ligar. Cada item deveria dar para reativar sem redescobrir nada.
>
> Isto não é uma lista de tarefas: são decisões de escopo.

---

## 1. Confirmação de e-mail + esqueci-a-senha

**O que é.** Provar que o endereço é mesmo da pessoa (código de 6 dígitos no
cadastro) e poder redefinir a senha por e-mail.

**Por que vale a pena.** Hoje **senha esquecida = conta perdida**: não há caminho
no app, só um `update` manual no SQL Editor. E, como o endereço nunca é
comprovado, dá para se cadastrar com o e-mail de outra pessoa.

**O que previne.** Conta trancada sem recurso; cadastro com e-mail alheio;
sequestro de conta por endereço não verificado.

### Precisa antes: um provedor de SMTP

O Supabase tem um mailer nativo, mas com um teto baixíssimo (poucos e-mails por
hora) e os códigos caem em spam. **Resend** ([resend.com](https://resend.com)) —
grátis, 3.000 e-mails/mês:

1. Criar conta.
2. **Domains → Add domain** → `selfos.com.br`.
3. Colar no DNS (Hostinger) os registros **SPF, DKIM e DMARC** que o Resend
   mostra, e esperar a verificação. **Sem isso os códigos vão para o spam e o
   domínio fica falsificável** — não pule este passo.
4. **API Keys → Create** → copiar a chave (`re_...`).

### O que restaurar

**`.env`** (gitignored, **sem** o prefixo `VITE_` — só `VITE_*` entra no bundle):
```
SUPABASE_AUTH_SMTP_PASS=re_sua_chave_aqui
```

**`supabase/config.toml`** — em `[auth.email]`, trocar o knob e acrescentar os
tempos; depois os blocos novos:
```toml
[auth.email]
enable_confirmations = true      # hoje: false
otp_length = 6
otp_expiry = 300                 # 5 min — curto, contra chute do código
max_frequency = "60s"            # piso global entre dois e-mails

[auth.email.smtp]
host = "smtp.resend.com"
port = 465
user = "resend"
pass = "env(SUPABASE_AUTH_SMTP_PASS)"
admin_email = "nao-responda@selfos.com.br"
sender_name = "Self OS"

[auth.email.template.confirmation]
subject = "Seu código do Self OS"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.recovery]
subject = "Redefinir sua senha do Self OS"
content_path = "./supabase/templates/recovery.html"
```
Em `[auth.rate_limit]`, subir `email_sent` (hoje `2`) e **manter
`token_verifications` baixo** (~10/h): 6 dígitos são 1 milhão de combinações, e a
trava real contra chutar o código é o limite de tentativas de verificação, não o
tamanho dele.

Criar `supabase/templates/confirmation.html` e `recovery.html` com `{{ .Token }}`
no corpo. Aplicar com:
```
set -a && source .env && set +a && supabase config push
```

**Banco** — o trigger `on_auth_user_confirmed` **já existe** e já está certo: ele
só cria o perfil na transição de `email_confirmed_at` para não-nulo. Nada a fazer.

**Front** — entra o que hoje não existe:
- um modal de OTP (6 casas) reutilizado pelo cadastro e pela recuperação;
- o contador de reenvio lendo o **timestamp real do banco**
  (`confirmation_sent_at` / `recovery_sent_at` via uma RPC `security definer`),
  **nunca** a abertura do modal — senão fechar e reabrir "zera" o cooldown;
- a tela `/forgot-password` + `resetPasswordForEmail` → `verifyOtp({type:'recovery'})`
  → `updateUser({password})` → `signOut`;
- em `SignupPage`, o passo do código depois do `signUp` (a sessão deixa de vir
  pronta);
- no e-mail desconhecido do "esqueci a senha", **mensagem genérica** — dizer "essa
  conta não existe" transforma a tela num verificador de quem tem conta.

Um **cooldown de negócio** no banco (trigger que recusa reenvio antes de ~180s) é
a segunda camada, além do `max_frequency` nativo.

---

## 2. CAPTCHA (Cloudflare Turnstile)

**O que é.** Um desafio invisível no login e no cadastro.

**Por que vale a pena.** Hoje a única trava contra chutar senha em massa é
`sign_in_sign_ups = 30` por 5 minutos por IP (~360 tentativas/hora do mesmo
endereço). Com o mínimo de 6 caracteres, é pouco.

**O que previne.** Força-bruta de senha; criação de contas em massa por bot (e,
se o item 1 for ligado, a queima da cota de e-mail junto).

**Onde criar conta.** [dash.cloudflare.com](https://dash.cloudflare.com) → menu
**Turnstile** → **Add site**. Grátis, sem cartão, e **não** exige migrar o DNS do
domínio para a Cloudflare. Hostnames: `selfos.com.br` e `localhost`. Modo
*Managed*. Copiar a **site key** (pública) e o **secret**.

**O que restaurar:**

`.env`:
```
VITE_TURNSTILE_SITE_KEY=0x4AAA...     # pública, pode ir no bundle
SUPABASE_AUTH_CAPTCHA_SECRET=0x4AAA...  # secreta, NUNCA com VITE_
```

`supabase/config.toml`:
```toml
[auth.captcha]
enabled = true
provider = "turnstile"
secret = "env(SUPABASE_AUTH_CAPTCHA_SECRET)"
```

`public/.htaccess` — a CSP precisa liberar o widget:
```
script-src ... https://challenges.cloudflare.com;
frame-src https://challenges.cloudflare.com;
```

Front — `npm i @marsidev/react-turnstile`, o widget em `LoginPage` e `SignupPage`,
e o token indo junto na chamada:
```ts
supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
supabase.auth.signUp({ email, password, options: { captchaToken, data: {...} } })
```

---

## 3. Login com Google

**O que é.** O botão "Entrar com Google".

**Por que vale a pena aqui em particular.** Contas do Google nascem confirmadas e
com o nome preenchido — e **quem entra pelo Google nunca esquece a senha**, que é
justamente o buraco deste projeto (item 1).

**Onde criar conta.** [console.cloud.google.com](https://console.cloud.google.com),
com a conta Google que você já tem. Grátis, sem cartão:
1. Criar um **projeto**.
2. **Tela de permissão OAuth** → Externo → nome do app → escopos `email` e `profile`.
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo Web**.
4. **URI de redirecionamento autorizado**: `https://xcxueyenovsowdzqkovm.supabase.co/auth/v1/callback`.
5. Copiar **client id** e **client secret**.

**O que restaurar:**

`.env`:
```
SUPABASE_AUTH_GOOGLE_SECRET=GOCSPX-...
```

`supabase/config.toml`:
```toml
[auth.external.google]
enabled = true
client_id = "....apps.googleusercontent.com"
secret = "env(SUPABASE_AUTH_GOOGLE_SECRET)"
```

Front — botão em `LoginPage`/`SignupPage`:
```ts
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/chat` },
})
```
O `redirectTo` precisa estar na `additional_redirect_urls`.

**Decisão que vem junto: mesmo e-mail em métodos diferentes.** Não deixe no acaso:
- **Vincular** (uma conta só, entra por senha *ou* Google): manter o vínculo
  automático de identidades ligado. Nada mais a fazer.
- **Bloquear** (contas separadas): desligar o vínculo automático **e** criar um
  guard `before insert` em `auth.users` que recuse e-mail já existente.

O trigger `handle_new_user` **já cobre** contas OAuth: elas nascem confirmadas, e
ele lê `full_name` de `raw_user_meta_data`, que é onde o Google põe o nome.

---

## 4. Excluir a conta pelo app

**O que é.** A pessoa encerrar a própria conta sem pedir para ninguém.

**Por que vale a pena.** Hoje só o SQL Editor faz isso. Para o trabalho da
disciplina é aceitável; para qualquer uso real, não.

**O que já está pronto** (não precisa de migração):
- a coluna `profile.deleted_at`;
- `current_profile_id()` já devolve `NULL` para conta desativada, o que fecha o
  acesso a todos os módulos;
- o `AuthContext` já derruba a sessão **em todos os aparelhos** ao encontrar
  `deleted_at` preenchido.

**Um detalhe para resolver junto** — a policy `profile_update_own` **não** filtra
`deleted_at`. Hoje isso é de propósito para o `select` (o app precisa LER
`deleted_at` para derrubar a sessão), mas o `update` herdou a mesma condição: um
token já emitido continua podendo gravar `full_name` e `avatar_path` da própria
linha pela API depois de a conta ser desativada. O impacto é pequeno — é a
própria linha, e todo o resto do sistema já está fechado — e a correção certa é
aqui, não numa migração solta: **o ban no `auth.users` é o que de fato para o
token**. Se quiser fechar antes, é uma migração de uma linha:
```sql
create policy profile_update_own on public.profile
  for update to authenticated
  using      (auth.uid() = auth_uuid and deleted_at is null)
  with check (auth.uid() = auth_uuid and deleted_at is null);
```

**O que falta:**

*Banco* — a função de soft-delete, que **não** pode ser um `update` direto do
`service_role` (a tabela usa grant de coluna, e `deleted_at` não está liberada):
```sql
create or replace function public.soft_delete_account(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profile set deleted_at = now() where auth_uuid = p_uid;
end;
$$;
revoke execute on function public.soft_delete_account(uuid) from public, anon, authenticated;
grant  execute on function public.soft_delete_account(uuid) to service_role;
```

*Edge Function* `supabase/functions/delete-account/`, com o `service_role` como
secret, fazendo **nesta ordem**:
```
0. uid = auth.getUser(jwt_do_chamador)   ← NUNCA um id vindo do corpo
1. rpc('soft_delete_account', { p_uid: uid })
2. auth.admin.updateUserById(uid, { ban_duration: '876000h' })
```
O passo 0 é o item importante: uma função com `service_role` que confia num id do
corpo da requisição deixa qualquer usuário **excluir a conta de outro**. E
**nunca** `auth.admin.deleteUser` — cascatearia o perfil e levaria junto todo o
histórico financeiro. Deploy: `supabase functions deploy delete-account`.

*Front* — no `ProfileCard`, um menu **⋮ discreto** no topo direito (nada de "zona
de perigo" em vermelho: um card grande e vermelho convida o clique) com "Excluir
conta", e **dois passos**: (1) digitar `EXCLUIR` em maiúsculo para habilitar
"Continuar"; (2) modal final mostrando **nome + e-mail** da conta que será
excluída. O texto precisa dizer que a conta será **desativada**, que o e-mail fica
**bloqueado** para novos cadastros e que **reativar só pelo suporte**.

**Reativar (manual, hoje e depois):** limpar `banned_until` em Authentication →
Users e `deleted_at` no perfil.

---

## 5. Menores

- **MFA/2FA (TOTP).** Nada implementado. Entraria no card de Segurança.
- **Anonimização de PII no soft-delete (LGPD).** Hoje o soft-delete só marca a
  data; nome e e-mail continuam lá.
- **Aviso de login em dispositivo novo.** Não é nativo do Supabase: exige uma
  tabela de dispositivo confiável e um **token persistente de dispositivo** (nunca
  o IP, que muda demais). Versão leve: só um e-mail de aviso, sem bloquear.
- **Subir o mínimo da senha de 6 para 8.** Uma linha em
  `supabase/config.toml` (`minimum_password_length`) **e** a constante
  `COMPRIMENTO_MINIMO_DA_SENHA` em
  `src/shared/components/PasswordRequirements.tsx` — os dois precisam concordar.

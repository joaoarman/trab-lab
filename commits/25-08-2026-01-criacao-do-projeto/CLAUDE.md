# 01 · Criação do projeto (Self OS)

**Data:** 25/08/2026

**Resumo:** Estruturação inicial do Self OS — identidade visual,
shell (sidebar + header + barra de abas), i18n em dois idiomas e os cinco módulos como
placeholder navegável. Nenhuma regra de negócio e nenhuma alteração de banco.

**Commit:** `feat: estruturar o Self OS (shell, tema, i18n e módulos placeholder)`

## O que foi feito

Entrevista de criação e definição do contexto do projeto. As decisões tomadas:

- **Produto:** auxiliar financeiro pessoal em que o registro e a consulta acontecem **pela
  conversa** — trabalho da disciplina Laboratório de Desenvolvimento de Software (ADS, IFRS
  Canoas). Domínio `selfos.com.br`.
- **Tenancy: B2C por usuário → RLS por dono.** Tabela `profile` com `id` = `auth.users.id`;
  todo dado do sistema é vinculado a um perfil. O filtro por dono não é escrito nas queries —
  quem garante é a RLS.
- **Plataforma: ambos igualmente.** O chat precisa ser confortável no celular (é onde a
  mensagem é mandada no meio do dia); as listas e o log precisam ser confortáveis no monitor
  (é onde se revisa o mês).
- **Referência de implementação do Chat:** um projeto anterior do mesmo autor, que já tem
  chat com IA, gravador de áudio, transcrição e log de tokens/custo rodando. Aproveitar a
  estrutura e o comportamento — não as cores nem a tipografia.

### Decisões de desenho que valem registrar

- **`--income` / `--expense` são tokens próprios**, separados de `--primary` e de
  `--destructive`. Num sistema financeiro, "entrou" e "saiu" é um par de cores com significado
  que aparece em toda tela; deixar cada tela escolher o próprio verde e vermelho tira o par de
  sintonia. E não podem ser os tokens existentes: `--primary` é a marca (um extrato cheio de
  receitas pareceria cheio de botões) e `--destructive` é perigo (um gasto de R$ 20 no posto
  não é erro — pintá-lo com a cor de "excluir" faria o app repreender o usuário a cada
  registro).
- **O Chat é rota de tela cheia** (`ROTAS_DE_TELA_CHEIA`, no `AppLayout`): shell `fixed`,
  altura `100dvh` e enquadramento aplicado por dentro da página. Resolve, antes de existir, os
  dois problemas que esse projeto anterior teve no aparelho — o campo de escrever sumindo atrás da
  barra do Safari (`100vh` mente no iOS) e a tela inteira arrastando junto com a conversa.
- **`--bottom-nav-height` é um token, não dois números.** A altura da barra de abas é lida pela
  própria barra e pelo espaço que o `<main>` reserva embaixo; escritos à mão, os dois divergem
  e a sobra vira um vão morto justamente embaixo do compositor do chat.
- **O Log da IA não entra na barra de abas do celular.** O critério não é "é um módulo?", é com
  que frequência se usa: a barra divide a largura do aparelho, e auditoria é uso mensal — no
  celular ele é alcançado pela gaveta.
- **Sem Home separada.** O Chat é a rota inicial (`/` redireciona para `/chat`): a conversa é o
  jeito pretendido de usar o sistema, e uma Home só empurraria o Chat para baixo.
- **Tema com três estados** (claro / escuro / seguir o sistema), e não um interruptor: quem
  escolhe escuro quer escuro sempre; quem segue o sistema quer que o app vire à noite junto com
  o aparelho.

## Front-end

**Identidade visual — `src/theme.css`** (fonte única)
- Identidade "Saldo": esmeralda sobre neutros quentes, nos dois temas.
- Tokens semânticos de dinheiro: `--income` (verde-grama) e `--expense` (coral).
- Tipografia self-hosted: Outfit (`font-display`), Inter (`font-sans`), JetBrains Mono
  (`font-mono`, para valores em R$).
- Raio 14px; enquadramento `--content-max-width` 80rem / `--content-padding` 24px;
  `--bottom-nav-height`.
- `tailwind.config.ts` mapeia as variáveis para utilitários (incluindo `income`/`expense`) —
  sem valores hardcoded. `index.css` ganhou os utilitários `h-viewport` (`100dvh` com fallback)
  e `scrollbar-none`.

**UI do projeto — `src/shared/components/ui/`**
- shadcn/ui configurado (`components.json`, estilo new-york, base stone, `cn` em
  `src/shared/lib/utils.ts`).
- Primitivos adicionados: button, card, input, label, textarea, separator, avatar,
  dropdown-menu, dialog, select, tooltip, badge, scroll-area.

**Shell — `src/shared/components/layout/`**
- `AppLayout` — desktop: sidebar fixa + header; celular: header com botão de menu + barra de
  abas. Trata as rotas de tela cheia.
- `Sidebar` — um componente, dois papéis (coluna fixa no desktop, gaveta no celular). Esc
  fecha, o foco entra no painel ao abrir, tocar num módulo fecha, e a gaveta mostra o sistema
  inteiro (inclusive o que não cabe na barra de abas).
- `Header`, `Brand`, `BottomNav`, `UserMenu`, `navigation.ts` (o mapa do sistema, lista única
  para sidebar/gaveta/barra/título do header) e `useTravaDeRolagem`.
- `ModulePlaceholder` em `src/shared/components/` — o corpo compartilhado das telas ainda não
  implementadas; sai do projeto quando o último módulo entrar.

**Tema — `src/shared/context/ThemeContext.tsx`**
- Três estados, classe `.dark` no `<html>`, persistência em `selfos.theme`, com anti-flash
  inline no `index.html` lendo a mesma chave. Acessos ao `localStorage` em try/catch (ele
  **lança** em aba anônima do Safari — uma exceção ali deixaria o app numa tela branca).

**i18n — `src/shared/i18n/`**
- `pt-BR` (padrão) + `en`, com `LANGUAGES` e `setLanguage` (persiste em `selfos.language` e
  atualiza o `lang` do `<html>`). Nenhum texto de UI hardcoded.
- Controles de **tema e idioma dentro do menu do usuário** — são preferências de conta, e um
  botão permanente no header gastaria, em toda tela, espaço que no celular é do título.

**Módulos — `src/pages/`**
- `Chat` (`/chat`, rota inicial), `Gastos` (`/gastos`), `Receitas` (`/receitas`),
  `Categorias` (`/categorias`), `Log` (`/log`) — cada um com `<Módulo>Page.tsx`, `components/`,
  `supabase.ts` (stub com as convenções da camada de dados) e a documentação com o
  propósito e as regras a definir.
- `App.tsx` registra as rotas; `/` e rota desconhecida redirecionam para `/chat` com `replace`
  (sem `replace`, o botão de voltar cairia em `/`, que traria de volta ao Chat — armadilha de
  navegação).

**Ambiente**
- `.gitignore` e `.env` criados a partir dos arquivos do template; `index.html` com o título e
  o script anti-flash.
- Validado: `tsc --noEmit` limpo, `vite build` OK, `npm run dev` servindo.

## Banco de dados (Supabase)

**Sem alterações nesta implementação.** Nenhuma tabela, policy, grant, function ou trigger foi
criado — ver `run.sql`. O schema entra módulo a módulo, conforme cada um
for detalhado.

O que já está decidido e vale para todas as migrations futuras: RLS por dono em todas as
tabelas, tabela `profile` com `id` = `auth.users.id`, e valores monetários e custos de IA em
**centavos**, em coluna inteira.

## Pendências conhecidas

- `.env` está vazio — falta a URL e a anon key do Supabase. O app sobe assim porque nenhuma
  tela importa o `supabaseClient` ainda.
- **Login não implementado.** O `UserMenu` mostra o estado deslogado com os itens de conta
  desabilitados; quando o auth entrar, as telas de autenticação ficam fora do `<AppLayout>` e
  as rotas passam a viver atrás de uma rota protegida.
- **Gastos e receitas: uma tabela com tipo/sinal ou duas tabelas?** Decidir ao implementar — a
  escolha muda as categorias (compartilhadas ou separadas
  por tipo).
- **Exclusão de categoria com filhos ou com registros vinculados:** bloquear, promover os
  filhos ou mover para uma categoria padrão? Decidir antes de implementar o módulo.

# 09 · PWA, cadastro desligado no front e correções do chat

**Data:** 27/08/2026

**Resumo:** O sistema virou **PWA** (instalável na tela de início, abrindo direto
no chat) e ganhou o slide que explica isso; o **cadastro saiu do front-end** para
a apresentação; e duas correções no chat: a **hora** de um gasto registrado por
conversa e a **mensagem de erro do microfone**, que dava o conselho errado.

**Commit:** `feat: tornar o app instalável como PWA, desligar o cadastro no front e corrigir a hora do gasto`

## O que foi feito

Quatro frentes, todas nascidas da preparação da defesa: uma pedida do produto
(PWA), uma trava de apresentação (cadastro) e dois defeitos vistos em uso.

### PWA — o site que também é aplicativo

O projeto ainda não era PWA: não havia manifest nem ícone.
Como o slide novo **afirma** que o sistema é instalável, ele foi implementado
antes: slide que a banca não consegue ver funcionando é pior do que slide nenhum.

O `start_url` do manifest é **`/chat`**, e não `/`. É a decisão de produto da
feature inteira: instalado, o app abre na conversa, e o caminho vira abrir, dizer
o gasto, minimizar. Com `/` haveria um redirecionamento no meio de um caminho que
existe para ser curto.

O **service worker é deliberadamente mínimo** e não guarda o app em cache. Ele
existe por dois motivos, e nenhum é velocidade: sem um SW com handler de `fetch`
o Chrome não oferece "instalar", e sem rede o app precisa mostrar algo que não
seja o dinossauro. Cache de aplicação serviria versão velha depois de um deploy,
e a hora em que isso apareceria seria a pior possível: no meio da apresentação,
com o navegador jurando que está tudo atualizado. A rede sempre ganha; o cache só
entra quando ela falha.

`viewport-fit=cover` + status bar translúcida trouxeram uma consequência que
precisou de conserto no shell: instalado, o app desenha **por baixo** do relógio
do iPhone. O `Header` e a gaveta ganharam `pt-[env(safe-area-inset-top)]`, que é
`0` no navegador e vira a altura do relógio quando instalado. A barra de abas já
tratava o `safe-area-inset-bottom`.

Os ícones saem da **marca do próprio sistema** (a `CircleDollarSign` da sidebar,
sobre o esmeralda do `theme.css`), gerados em PNG nos tamanhos que Android e iOS
pedem. O `favicon.svg`, que era um quadrado cinza genérico sobrando do template,
virou a mesma marca.

### O slide do PWA (#14 de 20)

Entra logo depois de "As telas, já implementadas" e antes de "Validação": acabou
de mostrar as telas, e a pergunta natural é "e no celular?".

Dois telefones **desenhados com a UI do app**, não imagens, pela mesma regra dos
diagramas do módulo: print não segue tema nem idioma. O da direita monta a tela de
Chat com as **mesmas chaves de i18n** que a tela real usa, então mudar o texto da
tela muda o slide junto. Os ícones vizinhos na tela de início são retângulos
vazios de propósito: desenhar apps de terceiros reconhecíveis num trabalho
acadêmico seria usar marca alheia sem precisar.

### Cadastro desligado no front-end

`/signup` deixou de montar a tela e passa a **redirecionar para `/login`** (quem
digitar o caminho à mão cai numa tela de verdade, e não numa página em branco), e
o link "criar conta" saiu do rodapé do login. A `SignupPage.tsx` fica intacta,
sem rota.

**É bloqueio de apresentação, não de segurança**, e isso está escrito onde alguém
vai procurar: `PENDENCIAS.md` (item 5, com o passo a passo para religar em três
edições). O
`signUp` do GoTrue segue aberto por escolha do autor; fechar de verdade é um
clique no painel do Supabase.

### A hora do gasto registrado por conversa

Defeito visto em uso: às 17h41, "gastei 20 de gasolina" salvava o gasto com a data
certa e **00:00** no cartão. Duas causas, e as duas foram corrigidas.

O prompt entregava ao modelo apenas a **data** de hoje, sem hora. Ele preenchia
`ocorreu_em` com essa data por reflexo, e data seca vira meia-noite. Agora a hora
local do usuário viaja para o prompt, derivada do `fusoEmMinutos` que a tela já
mandava (`agoraLocal`, em `comum.ts`).

A garantia, porém, ficou no **servidor**, que é onde ela vale mais que uma
instrução de prompt: `instanteDoFato` resolve **data seca cujo dia é hoje no fuso
do usuário como agora**. Dia passado sem hora continua meia-noite, porque ali a
hora é mesmo desconhecida e chutar seria pior.

O fallback "não deu para ler = agora" ficou **fora** do helper, nos `registrar_*`.
Dentro dele seria um estrago silencioso: `editar_gasto` com `ocorreu_em: null`,
coisa que modelo manda sem querer, moveria o gasto para o instante da edição em
vez de reclamar.

### O erro do microfone dizia a coisa errada

Todo `getUserMedia` que falhava virava uma mensagem só: "libere a permissão no
navegador". Só que quando o navegador **nem chega a perguntar** (macOS bloqueando
o navegador inteiro, ou o app aberto por `http://` num IP de rede), esse conselho
manda a pessoa clicar num cadeado que não resolve nada.

`useGravador` agora classifica a falha pelo `name` da `DOMException`, e o empate
entre "você negou" e "ninguém te perguntou" é desfeito por
`navigator.permissions.query({name: 'microphone'})`: site com estado `denied` é
bloqueio do site; qualquer outra coisa é bloqueio abaixo do navegador. São sete
códigos, cada um com a instrução certa nos dois idiomas.

## Front-end

- **Novo:** `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`,
  os PNGs do ícone (192, 512, maskable 512 e `apple-touch-icon` 180) e
  `src/shared/lib/pwa.ts` (registro do SW, só em produção).
- `index.html`: manifest, `apple-touch-icon`, meta tags de app do iPhone,
  `viewport-fit=cover` e `theme-color` por esquema de cor. `favicon.svg` passou a
  ser a marca do sistema.
- `Header.tsx` e `Sidebar.tsx`: `pt-[env(safe-area-inset-top)]`, para o app
  instalado não escrever por baixo do relógio do iPhone.
- **Novo:** `src/pages/Slides/components/TelefoneComOApp.tsx` e o slide `pwa` em
  `slides.tsx` (agora são 20 slides), com os textos nos dois idiomas.
- `App.tsx`: `/signup` virou redirecionamento para `/login`; `LoginPage` perdeu o
  rodapé com o link de cadastro e o `rodape` do `AuthShell` virou opcional.
- `useGravador.ts`: sete códigos de erro em vez de dois, com pré-checagem de
  contexto seguro; `Compositor` passou a usar o tipo exportado em vez de repetir a
  união.
- `basePrompt.ts` (Slides) ganhou o campo `agora`, porque ele monta o prompt real
  para o slide técnico.
- Edge Function `chat`: `agoraLocal`/`diaLocal`/`horaLocal` e `instanteDoFato` em
  `ferramentas/comum.ts`, usados por gastos e receitas; a hora entrou no cabeçalho
  do system prompt e a seção "Datas" pede o campo vazio para "agora".
- `tsc --noEmit` e `vite build` passam. O slide foi conferido renderizado em
  1280×650, 1600×900 e 500px de largura, nos dois temas.

## Banco de dados (Supabase)

**Sem alterações.** Nenhuma migration nova, nenhuma tabela, coluna, policy ou
grant mudou, e ninguém passou a ver ou poder mais nada.

**Mas há um deploy obrigatório:** a Edge Function `chat` mudou.

```bash
supabase functions deploy chat
```

Sem ele, o gasto registrado por conversa continua caindo à meia-noite. O cadastro
desligado é só front-end e não pede nada no servidor; para fechá-lo também lá, é
`Authentication → Providers → Email → Allow new users to sign up` no painel.

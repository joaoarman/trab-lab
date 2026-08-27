# 07 · "Ideias futuras" no pé da sidebar

**Data:** 27/08/2026

**Resumo:** Um bloco no pé da navegação lateral com os próximos módulos do Self OS
— Open Finance, Família, Agenda, Treinos, Alimentação e Tarefas — cada um com uma
badge "Ideia futura" e **sem clique**. Só front-end e i18n; nada de banco.

**Commit:** `feat: mostrar os próximos módulos do Self OS no pé da sidebar`

## O que foi feito

O produto se chama **Self OS**, mas quem abre o app pela primeira vez vê um app de
gastos: as seis linhas da sidebar falam todas de dinheiro. O bloco existe para
mostrar o desenho — o financeiro é o **primeiro** módulo de um sistema operacional
da vida pessoal, não o produto inteiro. Serve à apresentação da disciplina sem
prometer tela que não existe.

### As decisões que estruturam a implementação

**Item de navegação sem rota não é `NavItem`.** Os futuros vivem numa lista
própria (`MODULOS_FUTUROS`), com um tipo próprio (`ModuloFuturo`) que tem
`labelKey` e `icon` e **não tem `to`**. A alternativa — reaproveitar o `NavItem`
com uma rota falsa (`#`, `/em-breve`) — colocaria no roteador uma tela que ninguém
escreveu: o clique levaria a lugar nenhum e o usuário precisaria do "voltar" para
desfazer um caminho que o produto prometeu e não cumpre. Sem `to`, é o **tipo** que
garante que o item nunca vire link.

**`<div>`, e não `<button disabled>`.** Botão desabilitado comunica "esta ação
existe e está momentaneamente fora do ar" — não é o caso: não há para onde ir. Como
o elemento não é interativo, ele também sai da navegação por Tab sem precisar de
`tabIndex={-1}`, e o leitor de tela lê "Agenda, ideia futura" como texto, não como
um controle quebrado. O rótulo fica um degrau mais apagado
(`text-muted-foreground/70`) para que a diferença entre o que abre e o que não abre
seja visível antes de se ler a badge.

**Só na sidebar — fora da barra de abas.** É o mesmo critério que já mantém o Log
da IA fora dela: a barra inferior divide a largura do aparelho entre as abas, e
seis abas que não abrem nada encolheriam todo dia as que se usam todo dia. Na
sidebar (coluna, e gaveta no celular) um item a mais não tira espaço de ninguém.

**O bloco é colado no pé (`mt-auto`), não emendado na lista.** O que já funciona
tem de continuar sendo o primeiro bloco que se lê. Quando a coluna é curta demais
para sobrar espaço, o `mt-auto` não empurra nada e a navegação rola — o bloco nunca
cobre o que está acima.

**A badge perdeu o `uppercase`/`tracking` que o título do grupo tem.** O rótulo
final ("Ideia futura") tem 12 caracteres: em caixa alta com espaçamento, numa
coluna de 16rem, ele empurrava o nome do módulo para o truncamento — a diferença
entre ler "Alimentação" e ler "Alimentaç…".

### Front-end

- `src/shared/components/layout/navigation.ts` — novo tipo `ModuloFuturo` e a lista
  `MODULOS_FUTUROS` (Open Finance · Família · Agenda · Treinos · Alimentação ·
  Tarefas), com ícones `Landmark`, `Users`, `CalendarDays`, `Dumbbell`,
  `UtensilsCrossed` e `ListChecks`. `NAV_ITEMS` e `BOTTOM_NAV_ITEMS` ficaram
  intactos — nada mudou na navegação que funciona.
- `src/shared/components/layout/Sidebar.tsx` — novo `ModuloFuturoLink` (deriva do
  primitivo `Badge` da UI do projeto) e o bloco no pé do `<nav>`, sob o título
  "Ideias futuras". O `<nav>` virou `flex flex-col` para o `mt-auto` funcionar.
  Vale para os dois papéis do componente: coluna do desktop e gaveta do celular.
- `src/shared/i18n/locales/pt-BR.json` e `en.json` — oito chaves novas em `nav`
  (`upcoming`, `comingSoon` e os seis rótulos), nos dois idiomas. Nenhum texto
  hardcoded.

### Banco de dados (Supabase)

Sem alterações. Nada aqui lê ou grava: os itens são rótulo e ícone, e não existe
tabela, policy ou query nova.

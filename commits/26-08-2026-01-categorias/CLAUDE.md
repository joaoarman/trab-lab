# 03 · Categorias — a árvore, com exclusão que às vezes desativa

**Data:** 26/08/2026

**Resumo:** O módulo de Categorias de ponta a ponta — tabela `category`
auto-relacionada com RLS por dono, e uma tela de árvore para criar, editar e
remover categorias dentro de categorias. A regra que define o módulo: excluir uma
categoria com algo vinculado **não** a exclui — desativa, e ela vai para um
submenu de onde pode voltar.

**Commit:** `feat: implementar o módulo de categorias com árvore e exclusão que desativa`

## O que foi feito

### As três decisões que moldaram a implementação

**1. Excluir é soft-delete, e nem sempre exclui.** Sem nada vinculado, a
categoria é excluída (`deleted_at` preenchido — a linha sobrevive para o
histórico financeiro não apontar para o vazio, mas a RLS deixa de devolvê-la).
Com subcategorias ou lançamentos, ela é **desativada** (`is_active = false`),
junto com toda a subárvore. **Ter filha conta como vínculo**, e a desativação
desce em cascata: mãe inativa com filhas ativas deixaria as filhas sem caminho
até elas na tela. `deleted_at` preenchido força `is_active = false`, garantido em
dois níveis (trigger + check constraint).

**2. A decisão é do banco, e a modal avisa antes.** A confirmação consulta
`category_impact` ao abrir e escreve o desfecho real ("3 subcategorias vão
junto"), mudando até o rótulo do botão entre "Excluir" e "Desativar" — e nos dois
casos enuncia a regra, não só o resultado. Mas a prévia não é a decisão:
`category_remove` recalcula no instante de agir e devolve o que *realmente*
aconteceu, e é esse retorno que vira o aviso final.

**3. A tela não pode mexer em `is_active` nem em `deleted_at`.** O cliente não
tem grant nessas colunas; as três operações passam por RPCs. Sem isso, um
`update` direto pela API REST desfaria a cascata inteira.

**Lançamentos hoje são sempre zero**, porque `expense`/`income` ainda não
existem. O ponto de extensão está isolado em `category_linked_records`: quando os
módulos entrarem, é **uma edição em um lugar só** — o corpo pronto está comentado
dentro da própria função, e nem banco, nem tela, nem textos mudam.

### Front-end

- **`src/pages/Categorias/`** deixou de ser placeholder:
  - `CategoriasPage.tsx` — a árvore, o cabeçalho com contagem/ações e o submenu.
  - `components/LinhaDeCategoria.tsx` — a linha recursiva (dropdown por
    `Collapsible`, `+` para subcategoria, `⋯` para editar/excluir).
  - `components/DialogoDeCategoria.tsx` — criar **e** editar (mesmos dois campos),
    com o caminho da mãe no cabeçalho.
  - `components/DialogoDeRemocao.tsx` — a confirmação que consulta antes de perguntar.
  - `components/CategoriasDesativadas.tsx` — o submenu, fechado por padrão.
  - `components/SeletorDeCor.tsx` — paleta de 12 cores + `<input type="color">` livre.
  - `arvore.ts` — funções puras: lista plana → árvore, separação ativo/desativado,
    caminho até a raiz. Fora do `supabase.ts` porque não é consulta.
  - `supabase.ts` — as 6 queries/RPCs + o mapeamento de erro do Postgres → i18n.
- **`src/shared/components/ui/collapsible.tsx`** — primitivo novo, adicionado ao
  projeto via `npx shadcn add collapsible`, com as animações
  `collapsible-down`/`up` que o `tailwind.config.ts` já previa.
- **`src/shared/data/model.ts`** — `Categoria`, `NoDeCategoria`,
  `ImpactoDeExclusao`, `AcaoDeRemocao`.
- **i18n** — bloco `categories.*` reescrito nos dois idiomas (as chaves de
  placeholder saíram); plurais por `_one`/`_other`.
- **Decisões de interface:** tudo vem aberto (o estado guardado é o dos nós
  **fechados**, então conjunto vazio já é a árvore inteira à mostra e categoria
  nova nasce aberta de graça); hierarquia legível por três sinais ao mesmo tempo
  (recuo + linha guia vertical + seta, que só existe em quem tem filhas); ações
  sempre à vista, nunca só no hover (metade do uso é no celular); no submenu a
  única ação é Reativar — excluir de lá seria sempre um no-op, já que a categoria
  só chega ali *por ter algo vinculado*.

### Banco de dados (Supabase)

Migration `20260826100316_categorias.sql` (o `run.sql` desta pasta).

- **Tabela `public.category`** — `id`, `profile_id`, `parent_id`, `name`,
  `color`, `is_active`, `deleted_at`, `created_at`, `updated_at`.
  - `profile_id` com **DEFAULT `current_profile_id()`**: o front nunca o envia.
  - **FK de mãe composta** `(parent_id, profile_id) → (id, profile_id)`. Uma FK
    simples aceitaria pendurar a minha categoria debaixo da de outro usuário — a
    RLS impede *ler* a linha alheia, mas o `id` é um inteiro pequeno e chutá-lo é
    trivial. Com as duas colunas, é o banco que garante que a árvore não
    atravessa contas.
  - Checks: nome de 1–60, cor `^#[0-9a-f]{6}$`, sem auto-mãe, e
    "excluída ⇒ inativa".
- **Índices** — leitura por perfil, descida da árvore, e um **único de irmãs**
  (`profile_id`, mãe, `lower(name)`) nas linhas vivas: sem ele, o "achar ou criar"
  do Chat teria duas respostas e o total do mês passaria a mentir. Excluir libera
  o nome; desativar não.
- **Trigger `category_guard`** (`before insert or update`) — normaliza nome/cor,
  aplica "excluída ⇒ inativa", recusa ciclo (subindo pelos ancestrais, com teto
  de saltos) e mãe excluída, e faz filha de mãe inativa nascer inativa.
- **Functions** — `category_subtree` (recursiva), `category_linked_records` (o
  ponto de extensão), `category_action_for` (a regra, num lugar só, para prévia e
  ação nunca divergirem), e as três expostas: `category_impact`,
  `category_remove`, `category_reactivate`.
- **RLS** — `select`/`update` com `profile_id = current_profile_id() and
  deleted_at is null`; `insert` com o mesmo dono. **Sem policy de DELETE**: a
  saída é o soft-delete da RPC.
- **Grants** — `select` na tabela; `insert`/`update` **só** em
  `(name, color, parent_id)`. As internas não são expostas; as três RPCs vão para
  `authenticated`. Nada para `anon`.

#### Mudanças de acesso

Quem está logado passa a ver e alterar **as próprias categorias, e só elas** —
nome, cor e mãe pela API; ativação e exclusão apenas pelas RPCs. Nenhum acesso
novo para `anon`. Conta desativada continua bloqueada de graça, porque
`current_profile_id()` já filtra `deleted_at is null` no perfil.

## Auditoria feita antes deste commit

- **Corrigido — leitura de `old` sob `or` no trigger.** `tg_op = 'INSERT' or
  new.parent_id is distinct from old.parent_id` parecia seguro por
  curto-circuito, mas o PostgreSQL não garante a ordem de avaliação de um `or`:
  o segundo lado podia ser avaliado primeiro num INSERT (onde `old` não está
  atribuído) e derrubar **toda** criação de categoria. Reescrito com um booleano
  intermediário — `old` só é tocado no ramo de UPDATE.
- **Corrigido — oráculo de ids no trigger.** `category_guard` é `security
  definer` (enxerga a tabela sem RLS) e triggers disparam **antes** das
  constraints: inserir apontando para o `parent_id` de outra pessoa devolvia
  `category_parent_deleted` se a linha alheia estivesse excluída, e erro de FK se
  não estivesse. Nenhuma linha era criada nos dois casos, mas a diferença entre
  as mensagens já é um bit sobre um id que não é seu. Todas as consultas do
  trigger passaram a ser presas a `new.profile_id`.
- **Removidos dois exports órfãos** (`PALETA`, `montarArvore`) e **duas chaves de
  i18n sem uso** (`categories.inactive.show`/`hide`).
- Conferido: nenhum grant para `anon`; toda function `security definer` com
  `search_path = ''` e escopo por perfil (direto ou via `category_subtree`);
  `full_schema.sql` idêntico à soma das partes de `schema/`; nenhum texto de UI
  fixo; nenhuma cor de identidade hardcoded (a paleta é *dado do usuário*, não
  tema); nenhum componente chamando o cliente Supabase direto; `pt-BR` e `en` com
  o mesmo conjunto de chaves; `npm run build` limpo.

## O que ficou de fora, de propósito

**Mover categoria** (trocar a mãe) — é outro gesto, e ainda não foi desenhado. O
banco já está pronto: `parent_id` tem grant de update e a guarda de ciclo
funciona. Também de fora: reordenar irmãs à mão (a ordem é alfabética, decidida
na query), excluir de dentro do submenu e categorias iniciais para conta nova.
Tudo registrado na documentação do módulo.

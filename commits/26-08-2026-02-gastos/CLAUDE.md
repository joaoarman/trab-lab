# 04 · Gastos — o extrato, com moeda e cotação

**Data:** 26/08/2026

**Resumo:** O módulo de Gastos de ponta a ponta — tabela `expense` com RLS por
dono, e uma tela de extrato com filtro por período e categoria para registrar,
editar e excluir. Um gasto pode ser em **real ou em dólar**: escolhendo US$, o
sistema busca a cotação do momento e o **banco** converte para reais. De quebra, a
migration liga o ponto de extensão que o módulo de Categorias tinha deixado
pronto: uma categoria com gasto vinculado passa a ser desativada em vez de
excluída.

**Commit:** `feat: implementar o módulo de gastos com conversão de moeda no banco`

## O que foi feito

### As quatro decisões que moldaram a implementação

**1. Quem converte dólar em real é o banco, não o front.** O cliente manda valor,
moeda e cotação; a trigger `expense_guard` calcula `amount_brl`. O cliente **não
tem grant** nessa coluna — e é isso que torna a conversão inescapável. Com grant,
uma aba antiga aberta ou uma chamada direta à API REST gravaria "US$ 50 · cotação
5,16 · R$ 10,00", e o extrato passaria a mentir **de um jeito invisível**, porque
cada linha continuaria parecendo perfeitamente normal.

**2. A cotação é guardada na linha, não recalculada na leitura.** Cotação é um
fato **datado**: o gasto de US$ 50 de março valeu o dólar de março. Um extrato que
reconverte tudo pela cotação de hoje muda de valor sozinho toda manhã, e nenhum mês
fecha com o anterior.

**3. Dinheiro é `numeric(12,2)` — em reais, e decimal exato.** Os valores ficam em
reais, como se leem. O que se proíbe é o `float`: `numeric` é exato e a soma de mil
linhas fecha no centavo. No front o cuidado continua, porque o JavaScript só tem
`number` (binário): o total do período e o de cada dia passam por `somar`, que
acumula em centavos inteiros e divide uma vez no fim.

**4. Registrar nunca trava.** `category_id` é nulo — quem acabou de criar a conta
lança o primeiro gasto sem ter nenhuma categoria, e classifica depois. E a busca da
cotação **devolve `null` em vez de estourar** quando a API de terceiro cai: o campo
de cotação já está visível e editável, então uma API fora do ar não impede a pessoa
de registrar o que gastou.

### Ajuste de shell

Os ícones de Gastos e Receitas na navegação estavam **trocados**. Agora a seta
segue o dinheiro: gasto é o que **sai** (para baixo), receita é o que **entra**
(para cima) — o mesmo sentido que o par `--expense`/`--income` do tema já comunica
pela cor.

### Front-end

- **`src/pages/Gastos/`** deixou de ser placeholder: `GastosPage.tsx` (a lista
  agrupada por dia, com total do período e de cada dia), `periodo.ts` (os atalhos
  de período) e cinco componentes em `components/` — `FiltrosDeGastos`,
  `SeletorDeCategoria`, `LinhaDeGasto`, `DialogoDeGasto` e
  `DialogoDeRemocaoDeGasto`. Todos derivam dos primitivos do projeto; **nenhum
  primitivo novo foi necessário**.
- **`src/pages/Gastos/supabase.ts`** — `listarGastos`, `listarCategorias`,
  `criarGasto`, `salvarGasto`, `removerGasto` e `chaveDeErroDeGasto`.
- **`src/shared/lib/cotacao.ts`** (novo) — a cotação do dólar, com duas fontes sem
  chave (AwesomeAPI e exchangerate-api) e fallback para entrada manual. É a única
  chamada de rede do sistema que não vai ao Supabase.
- **`src/shared/utils/dinheiro.ts`** (novo) — `reaisDeTexto` (lê `1.250,90` e
  `1,250.90` sem perguntar o idioma), `textoDeValor` e `somar`.
- **`src/shared/data/arvoreDeCategorias.ts`** — era `src/pages/Categorias/arvore.ts`.
  Subiu para `shared` porque a hierarquia é a espinha de Categorias, Gastos,
  Receitas e Chat; ganhou `idsDaSubarvore` (o filtro que traz os descendentes
  junto) e `achatarArvore` (a árvore em ordem de leitura, para um `<select>`).
- **`src/shared/data/model.ts`** — `Moeda`, `Gasto`, `RascunhoDeGasto`,
  `FiltroDeGastos`.
- **`src/shared/components/layout/navigation.ts`** — ícones de Gastos e Receitas
  invertidos, com a regra escrita no comentário.
- **i18n** — o bloco `expenses.*` completo nos dois idiomas, no lugar das chaves de
  placeholder.
- **`src/shared/i18n/format.ts`** — sem novidade de API: o `formatMoney` que já
  existia passou a atender também os valores de gasto, já que eles vêm em reais.

### Banco de dados (Supabase)

- **Enum `public.currency`** (`'BRL'`, `'USD'`) — domínio fechado, para o relatório
  por moeda não depender de o front nunca errar a digitação.
- **Tabela `public.expense`** — `amount`/`amount_brl` em `numeric(12,2)`,
  `exchange_rate numeric(14,6)`, `occurred_at timestamptz` (quando o gasto
  **aconteceu**, não quando foi registrado), `category_id` nulável, `is_active` e
  `deleted_at`.
  - FK de categoria **composta** `(category_id, profile_id) → (id, profile_id)`: o
    gasto não se pendura na categoria de outra pessoa, e isso é integridade
    referencial, não uma policy que alguém pode esquecer.
  - A coerência do trio (moeda · cotação · valor em reais) é **check constraint**,
    e não só código da trigger — nem um `UPDATE` manual no SQL Editor cria a linha
    incoerente.
- **Índices** `expense_profile_occurred_idx` e `expense_category_idx`, os dois
  parciais (`where deleted_at is null`).
- **Trigger `expense_guard`** — normaliza, sustenta "excluído é sempre inativo",
  **calcula o valor em reais** e recusa categoria excluída. Toda consulta dela é
  presa a `new.profile_id`: sem isso, um id de categoria alheia devolveria
  mensagens diferentes conforme a linha existisse ou não, e a diferença já é um bit
  sobre um id que não é do usuário.
- **Function `expense_remove(id)`** — soft-delete, `security definer`, exposta só a
  `authenticated`.
- **`category_linked_records` reescrita** — era o ponto de extensão do módulo de
  Categorias, e devolvia `0`. Agora conta os gastos vivos da subárvore. **Uma
  categoria com gasto passa a ser desativada em vez de excluída**, sem nenhuma
  outra alteração: nem no banco, nem na tela, nem nos textos da modal.

**Mudanças de acesso:**

- RLS ligada em `expense`, com o padrão do projeto — `select`/`update` exigem
  `profile_id = current_profile_id()` **e** `deleted_at is null`; `insert` exige o
  dono. **Sem policy de `delete`**: a saída é o soft-delete da RPC.
- Grants recortados: `select` na tabela, mas `insert`/`update` **só** em
  `(name, amount, currency, exchange_rate, category_id, occurred_at)`. Ficam de
  fora `profile_id` (quem preenche é o DEFAULT), `amount_brl` (quem preenche é a
  trigger) e `is_active`/`deleted_at` (quem mexe é a RPC).
- Nenhuma function nova exposta a `anon`.

### Correção fora do escopo

`supabase/schema/full_schema.sql` não rodava do zero: `current_profile_id()` estava
definida na seção 5 (functions), depois das tabelas que a usam como `DEFAULT` — e o
PostgreSQL resolve a expressão de um `DEFAULT` no momento do `create table`. A
função foi antecipada para logo depois de `profile` (de onde ela lê), com a nota
explicando por que ela aparece duas vezes.

# 05 · Receitas — o que entrou, sem categoria

**Data:** 26/08/2026

**Resumo:** O módulo de Receitas de ponta a ponta — tabela `income` com RLS por
dono e uma tela de extrato com filtro por período para registrar, editar e
excluir. Mesma mecânica de moeda de Gastos (real ou dólar, com a conversão feita
pelo **banco**), com duas diferenças de projeto: receita **não tem categoria**, e a
lista mostra **as duas datas** — quando o dinheiro entrou e quando a receita foi
registrada. Para não duplicar a tela de Gastos, quatro peças subiram para
`src/shared/` e Gastos foi migrado para elas.

**Commit:** `feat: implementar o módulo de receitas e compartilhar as peças comuns com gastos`

## O que foi feito

### As três decisões que moldaram a implementação

**1. Receita não tem categoria.** Não é simplificação nem "fica para depois" — é o
que a natureza do dado pede. Gasto se pergunta **"em quê?"**, e a resposta é uma
árvore inteira (`Carro › Gasolina`), porque um mês tem dezenas de gastos
espalhados. Receita se pergunta **"de onde?"**, e a resposta cabe no nome: salário,
freela, aluguel. São três ou quatro linhas por mês, quase sempre as mesmas, e
classificá-las numa hierarquia é fricção sem retorno (regra 6). Pior: uma árvore
compartilhada faria "Carro" somar dinheiro que entra **e** que sai na mesma gaveta.

Isso **fecha a decisão que estava em aberto** no rascunho do módulo ("uma tabela
com sinal, ou duas tabelas?"): são duas tabelas, e a hierarquia é dos gastos.

**2. Duas datas, e as duas na tela.** `received_at` é quando o dinheiro entrou
(editável, e é por ela que a lista ordena e agrupa); `created_at` é quando a linha
foi criada no sistema. Dá para lançar na segunda o salário que caiu na sexta —
ordenar pelo registro colocaria esse salário no topo, como se tivesse acabado de
entrar. Em Gastos o `created_at` fica só no banco; aqui ele é **exibido**, e a
diferença entre as duas responde "isto está lançado desde quando?".

Consequência de segurança: `created_at` ficou **fora do grant de escrita**. Com
grant, daria para antedatar o próprio registro pela API REST, e a coluna que existe
justamente para dizer quando a linha entrou no sistema deixaria de servir para
isso.

**3. Quem converte dólar em real continua sendo o banco.** O cliente manda valor,
moeda e cotação; a trigger `income_guard` calcula `amount_brl`, e o cliente **não
tem grant** nessa coluna. É a mesma regra de Gastos, pelo mesmo motivo: com grant,
uma aba antiga aberta gravaria "US$ 500 · cotação 5,16 · R$ 10,00" e o extrato
passaria a mentir de um jeito invisível.

### A refatoração: quatro peças subiram para `shared/`

Copiar a tela de Gastos teria duplicado cerca de 250 linhas — incluindo aritmética
de fuso horário e a regra de "editar não reprecifica", que são exatamente o tipo de
código que diverge quando alguém corrige uma cópia só. Em vez disso:

| Antes | Agora | O que é |
| --- | --- | --- |
| `pages/Gastos/periodo.ts` | `shared/utils/datas.ts` | atalhos de período + os limites ISO da consulta (que estavam no `supabase.ts` de Gastos) + `Date` → `datetime-local` |
| os 3 campos de período em `FiltrosDeGastos` | `shared/components/FiltroDePeriodo.tsx` | o controle + a regra de "mexer numa data desfaz o atalho" |
| o bloco de valor/moeda/cotação do `DialogoDeGasto` | `shared/components/EntradaDeValor.tsx` | os campos, a busca da cotação e a prévia em reais |
| `agruparPorDia`/`rotuloDoDia` na `GastosPage` | `shared/data/extrato.ts` | o agrupamento por dia com o total do dia (genérico) |

O que **não** subiu: as queries. Cada `supabase.ts` continua inteiro no seu módulo,
como manda a convenção do projeto — subiu controle e aritmética, nunca acesso ao
banco. Gastos foi migrado para as quatro peças e continua se comportando igual.

### Front-end

- **`src/pages/Receitas/`** deixou de ser placeholder: `ReceitasPage.tsx` (a lista
  agrupada por dia, com total do período e de cada dia) e três componentes em
  `components/` — `LinhaDeReceita`, `DialogoDeReceita` e
  `DialogoDeRemocaoDeReceita`. Todos derivam dos primitivos do projeto; **nenhum
  primitivo novo foi necessário**. Não há um `FiltrosDeReceitas`: com um filtro só,
  a página monta a grade e chama o `FiltroDePeriodo` direto.
- **`src/pages/Receitas/supabase.ts`** — `listarReceitas`, `criarReceita`,
  `salvarReceita`, `removerReceita` e `chaveDeErroDeReceita`. `listarReceitas`
  recebe **um** argumento (a de Gastos recebe dois, porque lá o segundo é a lista
  de categorias de onde saem os ids da subárvore).
- **`src/shared/components/FiltroDePeriodo.tsx`** (novo) — devolve os três campos,
  e não uma grade fechada: Gastos põe um quarto campo na mesma linha, Receitas não.
  Exporta junto o `CampoDeFiltro`, para que o quarto campo tenha o mesmo
  enquadramento.
- **`src/shared/components/EntradaDeValor.tsx`** (novo) — os campos são
  controlados (o estado é do formulário), mas o **comportamento** mora aqui: trocar
  para US$ busca a cotação, voltar para R$ limpa. É isso que sustenta a regra de que
  **editar não reprecifica** — a busca acontece no gesto, nunca num `useEffect` de
  montagem. Exporta `numeroDeCotacao` para que a prévia e o valor gravado saiam do
  mesmo número.
- **`src/shared/utils/datas.ts`** (era `pages/Gastos/periodo.ts`) — toda conta de
  data do app, sempre no fuso local.
- **`src/shared/data/extrato.ts`** (novo) — `agruparPorDia` (genérica nos dois
  eixos que mudam entre os módulos: qual data agrupa e o que somar) e `rotuloDoDia`.
- **`src/shared/data/model.ts`** — `Receita`, `RascunhoDeReceita`,
  `FiltroDeReceitas` e `RecorteDePeriodo`; `FiltroDeGastos` passou a estender o
  último.
- **`src/pages/Gastos/`** — `GastosPage`, `FiltrosDeGastos` e `DialogoDeGasto`
  migrados para as peças compartilhadas. Sem mudança de comportamento.
- **i18n** — o bloco `income.*` completo nos dois idiomas, no lugar das chaves de
  placeholder; `nav.incomeSubtitle` deixou de prometer categoria. As chaves dos dois
  componentes compartilhados saíram de `expenses.*` para os blocos novos `period.*`
  (o filtro) e `money.*` (valor, moeda, cotação, prévia).

### Banco de dados (Supabase)

- **Tabela `public.income`** — `amount`/`amount_brl` em `numeric(12,2)`,
  `exchange_rate numeric(14,6)`, `received_at timestamptz` (quando o dinheiro
  **entrou**), `created_at` (quando foi **registrada** — e esta é lida pela tela),
  `is_active` e `deleted_at`. **Sem `category_id`**, e portanto sem a FK composta
  que `expense` precisa.
  - Reaproveita o enum `public.currency` de Gastos: um segundo enum faria o Chat ter
    de escolher qual usar ao ler "recebi 500 dólares".
  - A coerência do trio (moeda · cotação · valor em reais) é **check constraint**, e
    não só código da trigger — nem um `UPDATE` manual no SQL Editor cria a linha
    incoerente.
- **Índice `income_profile_received_idx`**, parcial (`where deleted_at is null`). É
  o **único** do módulo: sem categoria, não há um segundo eixo por onde percorrer —
  a diferença exata para `expense`, que tem `expense_category_idx`.
- **Trigger `income_guard`** — normaliza, sustenta "excluída é sempre inativa" e
  **calcula o valor em reais**. Diferente de `expense_guard`, não consulta nenhuma
  outra tabela: sem categoria, não há dono a conferir além do que a RLS já garante.
- **Function `income_remove(id)`** — soft-delete, `security definer`, exposta só a
  `authenticated`. A mesma mensagem para "não existe", "já foi excluída" e "é de
  outra pessoa": distinguir os casos confirmaria a existência de um id alheio.
- **`category_linked_records` NÃO mudou** — continua contando só gastos. A migration
  de Gastos previa que `income` entraria nessa conta, partindo da hipótese de que
  receita teria categoria; sem `category_id`, não existe vínculo a contar, e somar
  zero seria um JOIN a mais em toda exclusão de categoria. O comentário desatualizado
  foi corrigido em `supabase/schema/functions.sql` (o retrato do estado atual); a
  migration antiga não se edita — é forward-only.

**Mudanças de acesso:**

- RLS ligada em `income`, com o padrão do projeto — `select`/`update` exigem
  `profile_id = current_profile_id()` **e** `deleted_at is null`; `insert` exige o
  dono. **Sem policy de `delete`**: a saída é o soft-delete da RPC.
- Grants recortados: `select` na tabela, mas `insert`/`update` **só** em
  `(name, amount, currency, exchange_rate, received_at)`. Ficam de fora
  `profile_id` (quem preenche é o DEFAULT), `amount_brl` (quem preenche é a
  trigger), `is_active`/`deleted_at` (quem mexe é a RPC) e — novidade deste módulo
  — **`created_at`**, para que ninguém possa antedatar o registro que a tela exibe.
- Nenhuma function nova exposta a `anon`.
- Nenhuma alteração de acesso em `profile`, `category` ou `expense`.

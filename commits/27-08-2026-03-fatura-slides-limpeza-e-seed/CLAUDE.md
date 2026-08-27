# 08 · Fatura, Slides, limpeza do código e seed de demonstração

**Data:** 27/08/2026

**Resumo:** Quatro frentes que ficaram represadas sem commit: a tela de **Fatura**
(gasto e receita na mesma lista, com o saldo do período), a apresentação da
disciplina rodando **dentro do sistema** (`/slides`), a **limpeza de comentários**
em todo o código — 111 arquivos, ~7.500 linhas a menos — e a **seed de
demonstração** do perfil 1, que enche o extrato para a apresentação.

**Commit:** `feat: adicionar a Fatura e os slides, limpar os comentários do código e semear a demonstração`

## O que foi feito

Esta leva **junta várias entregas** porque nenhuma delas tinha sido commitada
ainda. Ela não é uma feature só, e a mensagem de commit reflete isso.

O que amarra as quatro é a mesma pergunta: **o trabalho está pronto para ser
aberto por outra pessoa?** A Fatura responde "sobrou?" — que Gastos e Receitas,
separadas, não respondem. Os slides põem a defesa dentro do próprio software. A
limpeza tira o andaime que só servia enquanto o código era escrito. E a seed
garante que, ao abrir, tem o que ver.

### Fatura — o extrato

`/statement`, seis arquivos, 477 linhas. **Só lê**: nenhuma tela nova de escrita,
nenhuma migration. É de propósito — a Fatura é onde se **confere**, e editar
continua sendo em Gastos, Receitas ou no Chat.

Ela reaproveita o que já existia em vez de duplicar: `extrato.ts` agrupa por dia,
`FiltroDePeriodo` recorta o tempo e `arvoreDeCategorias.ts` resolve o caminho da
categoria. O que é dela mora em `fatura.ts` — juntar as duas listas numa só, em
ordem, e fechar o saldo do período.

Não precisou de **nada** de banco: as policies de `expense` e `income` já
entregavam o que ela lê. Uma tela nova que não pede permissão nova é sinal de que
o escopo por perfil foi desenhado no lugar certo.

### Slides — a apresentação dentro do sistema

`/slides`, dezenove slides: requisitos priorizados, os diagramas de casos de uso e
ER em **SVG que seguem o tema e o idioma**, a comparação com produtos similares e
as telas, que ele abre de verdade em vez de mostrar print.

Fica no **menu do usuário**, não na navegação, porque **não é um módulo do Self
OS** — é anexo acadêmico. Sai do sistema apagando seis coisas, documentadas no
módulo. A análise dos concorrentes que alimenta o slide de
comparação está em `docs/produtos-similares/`.

### Limpeza dos comentários

111 arquivos, ~7.500 linhas removidas. O código tinha comentário demais: linha
narrando o que a linha seguinte já dizia. O que **ficou** foram 31 comentários que
explicam *por que*, e não *o quê* — mais 12 rótulos de cor em hexadecimal e 2
diretivas de ferramenta, que somem de vista se apagados.

As migrations aparecem no diff, mas **só perderam comentário**: um normalizador
comparou as duas versões ignorando comentário e espaço e confirmou que o SQL
executável é idêntico. O front foi conferido com `tsc --noEmit` e `vite build`,
que passam.

Junto saiu **código morto de verdade**: `exportPdf.ts` e `exportXlsx.ts`, que
nenhuma tela importava, e com eles cinco dependências — `jspdf`,
`jspdf-autotable`, `exceljs`, `file-saver` e `@types/file-saver`.

### `.gitignore` — a doc que é entrega

As pastas de `commits/` passaram a ser reincluídas no repositório: são elas que
documentam cada entrega ao lado do SQL que rodou, e é o que o professor precisa
abrir. A documentação de trabalho segue ignorada — é instrução para quem mexe no
código, não entrega.

### Seed de demonstração

`supabase/seeds/demo-perfil-1.sql`, 442 linhas, um `do $$` para colar no SQL
Editor. Cria **57 categorias** (Carro, Assinaturas, Saúde, Casa, Alimentação,
Transporte, Educação, Lazer, Vestuário e Presentes, com três níveis em Carro ›
Manutenção, Saúde › Suplementos e Casa › Contas), **~246 gastos** e **~23
receitas** dos últimos três meses.

Três decisões que valem registrar:

- **Nada de `random()`.** O valor sai de uma conta determinística sobre o dia, o
  que faz a seed produzir o **mesmo** extrato toda vez. Num material de
  apresentação isso importa: o número do slide não muda embaixo de quem apresenta.
- **`v_limpar` vem `true`** e apaga categorias, gastos e receitas do perfil antes
  de semear. É o que a torna repetível — e está em maiúsculas no cabeçalho, porque
  é destrutivo.
- **Os saldos contam uma história de propósito:** junho fecha negativo e julho e
  agosto positivos, para a Fatura ter o caso vermelho e o verde. Também há gastos
  em dólar, receita em dólar e três gastos **sem categoria** — casos reais do
  sistema que as telas precisam ter o que mostrar.

Como o SQL nunca é executado pelo assistente, a seed foi verificada num Postgres
descartável carregado com as tabelas, os índices e as triggers reais do
`supabase/schema/`: roda limpa, roda duas vezes sem duplicar, o `amount_brl` bate
em todas as linhas em moeda estrangeira e nenhuma categoria-folha ficou vazia.

## Front-end

- **Novo:** `src/pages/Fatura/` — `FaturaPage`, `FiltrosDaFatura`, `LinhaDaFatura`,
  `fatura.ts` (juntar as listas + saldo) e `supabase.ts` (só leitura).
- **Novo:** `src/pages/Slides/` — 11 arquivos, com os diagramas de casos de uso e
  ER em SVG que seguem tema e idioma, e o detalhe do base prompt.
- Rotas `/statement` e `/slides` no `App.tsx`; `/slides` entrou em
  `ROTAS_DE_TELA_CHEIA` e no menu do usuário, fora da navegação.
- Textos novos das duas telas nos **dois idiomas** (`pt-BR` e `en`).
- **Removidos:** `src/shared/utils/exportPdf.ts` e `exportXlsx.ts` (código morto) e
  as cinco dependências que só eles usavam.
- Comentários enxugados em 91 arquivos de `src/`; `tsc --noEmit` e `vite build`
  passam.

## Banco de dados (Supabase)

**Sem alterações.** Nenhuma migration nova, nenhuma tabela, coluna, policy ou
grant mudou — a Fatura lê `expense` e `income` com as policies que já existiam, e
o acesso de ninguém mudou.

As migrations de `supabase/migrations/` aparecem alteradas no diff, mas apenas
perderam comentário: o SQL executável é idêntico, conferido por normalização.
**Não há nada para rodar de novo.**

`supabase/schema/seeds.sql` ganhou um ponteiro dizendo onde vive a seed de
demonstração e por que ela **não** entra no `full_schema.sql`: recriar o banco não
pode trazer junto o extrato fictício de um usuário.

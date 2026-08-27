# 06 · Chat e Log da IA — o coração do sistema

**Data:** 27/08/2026

**Resumo:** A conversa que registra e consulta dinheiro por texto ou por áudio,
com tool calling, cartão de confirmação desenhado pelo sistema e recusa de
assunto fora do escopo — mais a tela de auditoria que mostra o que a IA fez e
quanto custou. Uma tabela só (`ai_log`) alimenta as duas telas, e duas Edge
Functions guardam a IA fora do `src/`.

**Commit:** `feat: implementar o chat com tool calling e o log de auditoria da IA`

## O que foi feito

O eixo do produto saiu do papel: durante o dia o usuário não navega por telas —
manda uma frase (ou um áudio) e a IA registra, corrige, exclui ou consulta por
baixo dos panos. Gastos, Receitas e Categorias passam a ser onde se **revisa** o
que a conversa gerou.

### As decisões que estruturam a implementação

**Uma tabela, duas telas.** `public.ai_log` guarda a conversa E a auditoria. A
alternativa (uma `chat_message` ligada 1:1 a um `ai_log`) criaria duas tabelas com
a mesma cardinalidade que toda leitura teria de costurar de volta — e que podem
divergir. O log existe para ser a prova do que aconteceu, e prova que pode faltar
não é prova. O Chat lê o recorte `is_active`; o Log lê tudo, com modelo, tokens,
custo e as ferramentas que rodaram.

**O que a IA diz não é prova; o que a IA faz é.** É o princípio que atravessa o
módulo inteiro, e cada peça dele nasceu de um defeito observado em uso:

- o **cartão de confirmação** é um componente React alimentado por
  `ai_log.receipts`, e o recibo só existe porque uma ferramenta de escrita voltou
  OK. Um "✅" digitado pela IA provaria apenas que ela escreveu "✅";
- a **recusa é uma ferramenta** (`assunto_fora_do_sistema`), não uma frase
  reconhecida no texto: a Edge Function descarta o texto do modelo e grava a frase
  padrão com `kind = 'REFUSAL'`, que a tela desenha em vermelho;
- **três travas** no laço comparam o texto do modelo com o que o banco registrou
  — falso sucesso ("registrei" sem escrita nenhuma), categoria anunciada e não
  criada, e recusa digitada em vez de chamada.

**A IA escreve com o JWT do usuário, nunca com `service_role`.** Toda leitura e
toda escrita passam pela mesma RLS das telas: se um prompt pedisse o gasto de
outra pessoa, o banco devolveria os do dono do token e nada mais.

**A categoria é escolhida pela IA, e criada quando não existe.** É o que permite
registrar sem nunca abrir a tela de Categorias. O prompt manda criar a gaveta certa
em vez de forçar a existente menos errada: gasto na gaveta errada some dentro de um
total que continua parecendo certo, e é pior que gasto sem gaveta nenhuma.

**Consulta não exige período.** "Qual foi o último gasto que registrei?" não tem
recorte, e sem um jeito de perguntar isso a IA respondia com o histórico da
conversa — que são 30 mensagens, não o banco.

### Front-end

- **Chat (`/chat`)** — nova rota, e a **rota inicial** do sistema. É rota de tela
  cheia (`ROTAS_DE_TELA_CHEIA`, no `AppLayout`): o shell não aplica margem nem
  largura máxima, e a página distribui o enquadramento por dentro.
  - `Bolha` — a mensagem, com três estados da IA (normal, com recibo, recusa em
    `--destructive-muted`). Os cartões vêm **acima** do balão: o fato primeiro, o
    comentário depois;
  - `CartaoDeRegistro` — valor, conversão de dólar com a cotação do momento, nome,
    **hierarquia inteira** da categoria, selo "nova" quando ela nasceu no turno, e
    **uma** data (quando aconteceu);
  - `Compositor` + `useGravador` + `OndaDeVoz` — a barra de baixo em dois modos no
    mesmo lugar, com `MediaRecorder`, cronômetro e onda de voz;
  - `Digitando`, `SeparadorDeDia`, `TextoDaIA` (só negrito e quebra de linha),
    `BoasVindasDoChat`, `DialogoDeLimpeza`.
- **Log da IA (`/ai-log`)** — totais de consumo do período no topo (`TotaisDeConsumo`)
  e a lista por data (`LinhaDoLog`, `DiaDoLog`), com as ferramentas dobráveis e os
  **argumentos crus em JSON**. `custo.ts` converte centavos → dólares em duas
  escalas de precisão, para uma mensagem de US$ 0,0004 não aparecer como US$ 0,00.
- **Compartilhado** — `shared/data/aiLog.ts` (a tradução da linha, usada pelas duas
  telas), o tipo `MensagemDaIA`/`ReciboDeRegistro` em `model.ts`, `dataLocal` e
  `deslocarData` em `utils/datas.ts`, e `formatMoney` aceitando opções de `Intl`.
- **Tema** — `--destructive-muted` nos dois temas (`theme.css`) + o mapeamento em
  `tailwind.config.ts`. Nenhuma cor hardcoded.
- **i18n** — as árvores `chat.*` e `log.*` nos dois idiomas (315 chaves, em
  paridade).
- **Removido** — `ModulePlaceholder.tsx` e as chaves `placeholder.*`: nenhum módulo
  é mais placeholder.

### Banco de dados (Supabase)

Duas migrations, no `run.sql` desta pasta, na ordem.

**`20260826230524_chat-e-log-da-ia.sql`**

- **`public.ai_log`** — `profile_id`, `role`, `content`, `source` (TEXT/AUDIO),
  `kind` (MESSAGE/REFUSAL), `receipts` e `tool_calls` (`jsonb`), `ai_model`, os três
  contadores de token, `cost_usd_cents numeric(12,6)`, `is_active`, `created_at`.
  Checks garantindo que áudio é do usuário, que recusa e payload são do assistente,
  e que tokens/custo não são negativos.
- **Índices** — `(profile_id, created_at desc, id desc)` para o Log; parcial
  `(profile_id, id desc) where is_active` para o Chat.
- **RLS** — `ai_log_select_own using (profile_id = public.current_profile_id())`.
  **Só SELECT:** não há policy nem grant de insert, update ou delete. Um log que a
  pessoa auditada consegue alterar não audita nada — e sem esse recorte seria
  possível forjar uma resposta da IA, inclusive um cartão de "gasto salvo" que
  nunca aconteceu.
- **RPCs** — `ai_log_add_turn` (`security definer`, grava as duas pontas do turno
  numa transação só; é a **única** porta de escrita da tabela), `chat_clear`
  (marca `is_active = false`, nunca `delete`), `category_resolve_path` (achar ou
  criar cada degrau de um caminho), `expense_report`, `expense_by_category`,
  `income_report` e `ai_log_report`.
- **Correção de retrato** — `grant execute on function category_reactivate(int) to
  authenticated` existia na migration de Categorias mas faltava em
  `schema/grants.sql` e no `full_schema.sql`. O banco estava certo; o retrato,
  errado. Repetido aqui para um banco recriado a partir do retrato também acertar.

**`20260827102122_consulta-sem-periodo.sql`**

- `p_from` e `p_to` de **`expense_report`** e **`income_report`** passam a aceitar
  NULL (`p_from is null or …`), com o sentido de "sem limite deste lado". É
  extensão pura: quem passa as duas datas — as telas de Gastos, Receitas e Log da
  IA — se comporta exatamente como antes, e a assinatura não muda, então os grants
  sobrevivem ao `create or replace`.
- Não se manda uma data antiga no lugar do nulo: "1970-01-01" é um período, e
  apareceria no Log da IA como uma decisão que a IA nunca tomou.

**Mudanças de acesso:** nenhuma ampliação. `ai_log` nasce com SELECT-only para
`authenticated`; a escrita mora em RPC `security definer`. As tabelas `expense`,
`income` e `category` não ganharam nem perderam permissão — a IA usa exatamente as
que a tela já usava.

### Fora do `src/` — as Edge Functions

Não são front nem banco, e é a primeira vez que o projeto tem essa camada:

- **`supabase/functions/chat/`** — o laço da conversa, o `prompts.ts` (modelos,
  preços, `BASE_PROMPT`, as travas) e **treze ferramentas** em quatro arquivos:
  cinco de gasto, quatro de receita, três de categoria e a de recusa de escopo.
  Modelo `gpt-4.1-mini`, teto de 8 rodadas, ferramentas executadas **em série**
  (duas chamadas resolvendo o mesmo caminho de categoria em paralelo quebrariam o
  índice único).
- **`supabase/functions/transcribe/`** — o áudio vira texto (`gpt-4o-transcribe`).
  Separada por chave própria e porque a tela precisa dos dois momentos: a bolha do
  usuário aparece com a transcrição antes de a IA começar a responder.
- **`supabase/functions/.env`** — as duas chaves da OpenAI, gitignored, com
  `.env.example` ao lado.
- **`supabase/config.toml`** — blocos `[functions.chat]` e `[functions.transcribe]`
  com `verify_jwt = true`: as duas gastam dinheiro por chamada, e sem a exigência
  do token qualquer pessoa com a URL do projeto dispararia chamadas na conta do
  dono.

## Como aplicar

1. o `run.sql` desta pasta, no SQL Editor;
2. preencher `supabase/functions/.env` com as duas chaves;
3. `supabase functions deploy chat` e `supabase functions deploy transcribe`;
4. `supabase secrets set --env-file supabase/functions/.env`;
5. `supabase config push` (revisando o diff — traz os blocos `[functions.*]`).

O passo 1 vem **antes** do 3: a função nova manda período nulo nas consultas sem
recorte, e contra o banco antigo `occurred_at >= null` descarta todas as linhas.

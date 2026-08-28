# Self OS — auxiliar financeiro pessoal

Um sistema onde você registra e consulta os próprios gastos e receitas
**conversando**, por texto ou por áudio. A IA entende a frase, cadastra o
lançamento na categoria certa (criando a categoria se ela não existir) e responde
com um cartão de confirmação.

> Trabalho da disciplina **Laboratório de Desenvolvimento de Software** — curso de
> **Análise e Desenvolvimento de Sistemas**, **IFRS – Campus Canoas**.

---

## O problema

Controlar dinheiro dá trabalho de digitação. Abrir um app, achar a tela, escolher
a categoria, digitar o valor — é fricção suficiente para a pessoa desistir depois
de uma semana, e aí o extrato do mês não significa nada porque está incompleto.

Aqui o registro custa uma frase.

## O eixo do produto: o chat

```
você  › acabei de gastar R$ 20 no posto de gasolina
       ✓ R$ 20,00 · Carro › Gasolina · hoje, 14:32

você  › quanto gastei de gasolina esse mês?
       R$ 180,00 em Carro › Gasolina

você  › e com carro no total?
       R$ 640,00 em Carro (somando todas as subcategorias)
```

Pela conversa dá para **registrar, consultar, editar e excluir** gastos e
receitas, além de criar e reorganizar categorias.

As telas de Fatura, Gastos, Receitas e Categorias existem para **ver, revisar e
ajustar** o que a conversa gera — não são o caminho obrigatório de entrada de
dados.

## A hierarquia é dos gastos

Gasto se pergunta "em quê?", e a resposta é uma árvore: `Carro › Gasolina`,
`Casa › Mercado`. Consultar um nó soma ele **e todos os descendentes**.

Receita se pergunta "de onde?", e a resposta cabe no nome — salário, freela,
aluguel. Por isso receita não tem categoria.

## Telas

| Tela | Rota | O que faz |
| --- | --- | --- |
| **Chat** | `/chat` | A conversa com a IA. É a rota inicial e o coração do sistema. |
| **Fatura** | `/statement` | O extrato: gasto e receita na mesma lista, com o saldo do período. Responde "sobrou?". |
| **Gastos** | `/expenses` | O que saiu, por categoria, com suporte a outra moeda e cotação. |
| **Receitas** | `/income` | O que entrou. |
| **Categorias** | `/categories` | A árvore de categorias. |
| **Log da IA** | `/ai-log` | Auditoria: cada chamada à IA com modelo, tokens, custo e as ferramentas que rodaram. |
| **Conta** | `/account` | Dados do perfil, foto, senha, tema e idioma. |
| **Login** | `/login` | Autenticação. Todas as outras rotas ficam atrás dela. |
| **Slides** | `/slides` | A apresentação do trabalho, rodando dentro do próprio sistema. |

## A IA

O chat usa a API da **OpenAI** com *tool calling*: o modelo não escreve no banco
por conta própria — ele chama ferramentas (registrar gasto, consultar período,
criar categoria, recusar assunto fora de escopo) e o servidor é quem executa.

O princípio que sustenta o módulo: **o que a IA diz não é prova; o que ela faz
é.** O cartão de confirmação só aparece quando uma ferramenta de escrita voltou
OK, e travas no laço comparam o texto do modelo com o que o banco de fato
registrou.

Toda chamada é gravada em `ai_log` com modelo, tokens, custo e ferramentas — é o
que a tela de Log da IA mostra.

## Segurança e privacidade dos dados

O sistema é **por usuário final**: cada pessoa cria a própria conta e vê **somente
os próprios dados**. Não há organização, compartilhamento nem visão de
administrador.

Isso não é garantido pelas queries do front-end, e sim por **Row Level Security**
no PostgreSQL: toda tabela tem policy `profile_id = current_profile_id()`, e essa
função também filtra conta desativada — desativar uma conta fecha o acesso a todos
os módulos de uma vez.

Valores monetários vão em coluna `numeric`, nunca `float`: em ponto flutuante
`0.1 + 0.2` não dá `0.3`, e um extrato que não fecha não serve para nada.

## Stack

**Front-end** — React 18 + Vite + TypeScript, Tailwind CSS e componentes próprios
sobre Radix UI, React Router, react-i18next.

**Back-end** — Supabase (PostgreSQL, Auth e Storage), com duas Edge Functions em
Deno: `chat` (a conversa com a IA) e `transcribe` (áudio → texto).

**Tabelas** — `profile`, `category`, `expense`, `income`, `ai_log`.

Outras características:

- **PWA** — abre no link como qualquer site e pode ser **instalado** na tela de
  início do celular ou na área de trabalho, abrindo em tela cheia direto no chat.
- **Responsivo** — celular e desktop com o mesmo peso: sidebar no desktop, gaveta
  e barra de abas no celular.
- **Tema claro/escuro** — com a opção de seguir o sistema.
- **Bilíngue** — português (padrão) e inglês; nenhum texto fica fixo no código.

## Rodando localmente

Requisitos: Node 18+ e uma conta no [Supabase](https://supabase.com).

```bash
# 1. dependências
npm install

# 2. credenciais do Supabase
cp env.example .env
#    preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# 3. banco
#    cole supabase/schema/full_schema.sql no SQL Editor do seu projeto Supabase

# 4. subir
npm run dev
```

Para o chat e o áudio funcionarem, as Edge Functions precisam das chaves da
OpenAI:

```bash
cp supabase/functions/.env.example supabase/functions/.env
#    preencha OPENAI_API_KEY_CHAT e OPENAI_API_KEY_TRANSCRIPTION

supabase functions serve --env-file supabase/functions/.env   # local
supabase secrets set --env-file supabase/functions/.env       # produção
supabase functions deploy chat transcribe
```

Scripts disponíveis: `npm run dev`, `npm run build`, `npm run preview`,
`npm run typecheck`.

## Estrutura do repositório

```
src/
  pages/<Módulo>/     uma pasta por tela: a página, seus componentes
                      e o supabase.ts com as queries do módulo
  shared/             o que atravessa módulos: shell, componentes de UI,
                      i18n, modelo de domínio, utilitários e contextos
  theme.css           a identidade visual inteira — cores, tipografia,
                      raio e densidade, como CSS variables

supabase/
  migrations/         o SQL de cada entrega, em ordem
  schema/             o estado atual do banco, por assunto
  functions/          as Edge Functions (chat e transcribe)
  seeds/              dados de demonstração

docs/                 documentação de assuntos que atravessam o sistema
commits/              o resumo e o SQL de cada entrega
```

### Dados de demonstração

O banco nasce vazio — tudo vem do uso. Para abrir o sistema com o extrato cheio,
`supabase/seeds/demo-perfil-1.sql` semeia categorias, gastos e receitas de um
perfil. Leia as três constantes do topo antes de rodar: uma delas **apaga** os
dados daquele perfil antes de semear.

Os valores não saem de `random()`, e sim de uma conta determinística sobre o dia:
rodar duas vezes dá o mesmo extrato.

## O que ficou de fora

Confirmação de e-mail, esqueci-a-senha, CAPTCHA, login com Google e exclusão de
conta estão documentados em [`PENDENCIAS.md`](PENDENCIAS.md), com o passo a passo
de como ligar cada um. O cadastro está desligado no front-end para a
apresentação.

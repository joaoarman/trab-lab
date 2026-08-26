// =============================================================================
// Modelo de domínio do sistema (vocabulário do app, em camelCase).
// As funções de dados (supabase.ts de cada módulo) RETORNAM estes tipos —
// nunca o objeto cru do Supabase. É a "costura" para uma futura troca de API.
//
// Mocks/dados de exemplo (temporários) também ficam em src/shared/data/
// (ex.: seed.ts), e devem ser removidos ao entrar as chamadas reais do Supabase.
// =============================================================================

/**
 * O perfil do usuário logado — a linha de `public.profile` traduzida.
 *
 * `id` é o inteiro do perfil: é ele que as tabelas de gasto, receita, categoria,
 * chat e log da IA vão referenciar. `authUuid` é a ligação com o Supabase Auth,
 * e serve ao front para uma coisa só: montar o caminho da foto no bucket
 * (`<authUuid>/avatar.jpg`).
 */
export interface Perfil {
  id: number
  authUuid: string
  nome: string
  /**
   * Espelho de `auth.users.email`. Somente leitura pelo app — trocar o e-mail é
   * um fluxo do Supabase Auth (ver `src/pages/Account/supabase.ts`), nunca um
   * update nesta coluna.
   */
  email: string
  /**
   * CAMINHO do objeto no bucket `avatars` (ex.: `<authUuid>/avatar.jpg`), ou
   * null. Não é uma URL: quem monta a URL pública é `urlDoAvatar()`, no
   * `supabase.ts` do módulo Account. Guardar a URL pronta assaria o endereço do
   * projeto Supabase dentro dos dados.
   */
  avatarPath: string | null
  /** Preenchido = conta desativada. O app derruba a sessão quando encontra. */
  desativadoEm: string | null
  /** Última gravação do perfil — usada como "versão" da foto (cache busting). */
  atualizadoEm: string
}

/**
 * Uma categoria da hierarquia — a linha de `public.category` traduzida.
 *
 * A árvore é auto-relacionada: `paiId` aponta para a categoria mãe, e `null`
 * significa categoria de topo. A profundidade é livre (`Carro › Gasolina`,
 * `Casa › Mercado › Feira`).
 *
 * A **forma de árvore** é montada no front, em `pages/Categorias/arvore.ts`: o
 * banco devolve a lista plana, que é o formato certo para trafegar.
 */
export interface Categoria {
  id: number
  /** Categoria mãe. `null` = categoria de topo. */
  paiId: number | null
  nome: string
  /**
   * A etiqueta de cor escolhida pelo usuário, em hexadecimal (`#10b981`).
   *
   * É **dado**, não identidade visual: a paleta, as fontes e o raio do app
   * continuam vindo do `src/theme.css`. O que se guarda aqui é a escolha da
   * pessoa de pintar "Carro" de verde — por isso vai num `style`, e não numa
   * classe do Tailwind.
   */
  cor: string
  /**
   * Ativa. `false` = desativada: sai da árvore principal e vai para o submenu
   * "Desativadas", de onde pode voltar. Uma categoria desativada arrasta a
   * subárvore inteira junto — o banco garante esse invariante.
   */
  ativa: boolean
  criadaEm: string
}

/** Uma categoria já com as filhas penduradas — o formato que a tela desenha. */
export interface NoDeCategoria extends Categoria {
  filhas: NoDeCategoria[]
}

/**
 * O que **aconteceria** ao excluir uma categoria — a prévia que a modal de
 * confirmação usa para dizer a verdade em vez de um texto genérico.
 *
 * É só uma prévia: quem decide de fato é o banco, no momento de agir
 * (`excluirCategoria` devolve o que realmente aconteceu).
 */
export interface ImpactoDeExclusao {
  /** Quantas subcategorias vão junto (a própria categoria não conta). */
  descendentes: number
  /** Quantos lançamentos (gastos/receitas) apontam para a subárvore. */
  registros: number
  /** `'excluir'` só quando não há nada vinculado; senão, `'desativar'`. */
  acao: AcaoDeRemocao
}

/** O destino de uma categoria ao ser removida. */
export type AcaoDeRemocao = 'excluir' | 'desativar'

/**
 * A moeda de um lançamento — o enum `public.currency` do banco.
 *
 * Domínio fechado de propósito: um texto livre aceitaria `R$`, `reais`, `brl` e
 * `BRL ` como quatro moedas distintas, e o relatório por moeda passaria a
 * depender de o front-end nunca errar a digitação.
 */
export type Moeda = 'BRL' | 'USD'

/**
 * Um gasto — a linha de `public.expense` traduzida.
 *
 * ## Dois valores, e o porquê
 *
 * `valor` é o que a pessoa gastou, **na moeda em que gastou**. `valorEmBrl` é o
 * mesmo gasto em reais. Todo total do sistema — o mês, o gráfico por categoria, a
 * resposta do Chat — soma o **segundo**: somar o primeiro colocaria dólar e real
 * na mesma conta, e o resultado não seria dinheiro nenhum.
 *
 * Os dois são números em **reais** (`numeric(12,2)` no banco — decimal exato, e
 * nunca `float`). Para exibir, use `formatMoney` de `src/shared/i18n/format.ts`;
 * para **somar** vários, use `somar` de `src/shared/utils/dinheiro.ts`, que faz a
 * conta em centavos inteiros — o `number` do JavaScript é binário, e somar
 * `0.1 + 0.2` direto dá `0.30000000000000004`.
 *
 * Quem calcula `valorEmBrl` é o **banco**, na trigger de escrita. O front manda
 * valor, moeda e cotação; a conversão não passa por aqui.
 */
export interface Gasto {
  id: number
  /** `null` = "Sem categoria" — registrar nunca trava por falta de hierarquia. */
  categoriaId: number | null
  /** Onde/no que foi o gasto ("posto de gasolina"). A categoria diz a gaveta. */
  nome: string
  /** Em reais (ou na unidade de `moeda`). US$ 50,00 = `50` — não em centavos. */
  valor: number
  moeda: Moeda
  /**
   * A taxa de câmbio do **momento do registro**: quantos reais valia 1 unidade
   * de `moeda`. `null` quando o gasto já é em reais.
   *
   * É guardada, e não recalculada na leitura, porque cotação é um fato datado: o
   * gasto de US$ 50 de março valeu o dólar de março. Um extrato que reconverte
   * tudo pela cotação de hoje muda de valor sozinho toda manhã.
   */
  cotacao: number | null
  /** O mesmo valor convertido para reais. É esta coluna que todo total soma. */
  valorEmBrl: number
  /**
   * Quando o gasto **aconteceu** — não quando foi registrado.
   *
   * A distinção é o motivo de o campo existir: dá para lançar hoje, à noite, o
   * almoço de ontem. Ordenar pelo registro colocaria esse almoço no topo da
   * lista, como se fosse a coisa mais recente que a pessoa fez.
   */
  ocorreuEm: string
  /** Hoje só acompanha a exclusão. Reservado para um "arquivar" futuro. */
  ativo: boolean
  criadoEm: string
}

/** O que a tela manda para criar ou salvar um gasto. */
export interface RascunhoDeGasto {
  nome: string
  /** Em reais (ou na unidade da moeda escolhida). */
  valor: number
  moeda: Moeda
  /** Obrigatória fora do real; ignorada (e zerada pelo banco) quando é BRL. */
  cotacao: number | null
  categoriaId: number | null
  /** ISO 8601. */
  ocorreuEm: string
}

/**
 * Um recorte de tempo — as duas pontas de um período, **fechadas nas duas**.
 *
 * Mora aqui, e não na pasta de um módulo, porque três coisas o usam: o filtro de
 * Gastos, o de Receitas e as funções puras de `shared/utils/datas.ts` (os
 * atalhos "este mês"/"mês passado" e a conversão para os limites `timestamptz`
 * da consulta).
 *
 * As datas trafegam como `YYYY-MM-DD` porque é o formato do `<input type="date">`
 * — e sempre em data **local**, nunca em UTC. O porquê está no `periodo.ts`.
 */
export interface RecorteDePeriodo {
  /** Data (YYYY-MM-DD), inclusive — o dia inteiro entra. */
  de: string
  /** Data (YYYY-MM-DD), inclusive — o dia inteiro entra. */
  ate: string
}

/** O recorte que a lista de gastos está mostrando: período + categoria. */
export interface FiltroDeGastos extends RecorteDePeriodo {
  /**
   * `null` = todas as categorias · `'sem'` = só os gastos sem categoria ·
   * número = aquela categoria **e todos os descendentes dela** (é o que faz
   * "Carro" trazer "Carro › Gasolina" junto).
   */
  categoriaId: number | 'sem' | null
}

/**
 * Uma receita — a linha de `public.income` traduzida.
 *
 * ## O espelho de `Gasto`, com duas diferenças de propósito
 *
 * **Não tem categoria.** Não é simplificação: é o que a natureza do dado pede.
 * Gasto se pergunta "em quê?", e a resposta é uma árvore inteira
 * (`Carro › Gasolina`), porque um mês tem dezenas de gastos espalhados. Receita
 * se pergunta "de onde?", e a resposta cabe no `nome`: salário, freela, aluguel.
 * São três ou quatro linhas por mês, e classificar três linhas numa hierarquia é
 * fricção sem retorno.
 *
 * **Tem duas datas, e as duas aparecem na tela** — ver `recebidaEm` e
 * `registradaEm`.
 *
 * O resto é igual, e igual pelos mesmos motivos: `valor` é o que entrou na moeda
 * em que entrou, `valorEmBrl` é o mesmo em reais, e é o **segundo** que todo
 * total soma. Quem converte é a trigger `income_guard`, no banco — o front manda
 * valor, moeda e cotação, e não tem grant na coluna convertida.
 */
export interface Receita {
  id: number
  /** De onde veio o dinheiro ("salário", "freela do site"). O único descritor. */
  nome: string
  /** Em reais (ou na unidade de `moeda`). US$ 500,00 = `500` — não em centavos. */
  valor: number
  moeda: Moeda
  /**
   * A taxa de câmbio do **momento do registro**: quantos reais valia 1 unidade
   * de `moeda`. `null` quando a receita já é em reais.
   *
   * É guardada, e não recalculada na leitura, porque cotação é um fato datado: o
   * freela de US$ 500 recebido em março valeu o dólar de março.
   */
  cotacao: number | null
  /** O mesmo valor convertido para reais. É esta coluna que todo total soma. */
  valorEmBrl: number
  /**
   * Quando o dinheiro **entrou** — não quando a receita foi registrada.
   *
   * É por ela que a lista ordena e agrupa. A distinção com `registradaEm` é o
   * motivo de as duas existirem: dá para lançar na segunda o salário que caiu na
   * sexta, e ordenar pelo registro colocaria esse salário no topo, como se
   * tivesse acabado de entrar.
   */
  recebidaEm: string
  /**
   * Quando a receita foi **registrada no sistema**.
   *
   * Em `Gasto` o equivalente (`criadoEm`) existe mas não vai para a tela. Aqui
   * ele é **exibido**, a pedido: a lista mostra as duas datas, e a diferença
   * entre elas — "recebi na sexta, lancei na segunda" — fica auditável a olho
   * nu, sem abrir nada.
   *
   * O cliente não tem grant de escrita nesta coluna. É o que impede antedatar o
   * próprio registro e esvaziar o sentido do que a tela mostra.
   */
  registradaEm: string
  /** Hoje só acompanha a exclusão. Reservado para um "arquivar" futuro. */
  ativa: boolean
}

/** O que a tela manda para criar ou salvar uma receita. */
export interface RascunhoDeReceita {
  nome: string
  /** Em reais (ou na unidade da moeda escolhida). */
  valor: number
  moeda: Moeda
  /** Obrigatória fora do real; ignorada (e zerada pelo banco) quando é BRL. */
  cotacao: number | null
  /** ISO 8601. */
  recebidaEm: string
}

/**
 * O recorte que a lista de receitas está mostrando.
 *
 * É só o período — sem o `categoriaId` de `FiltroDeGastos`, porque receita não
 * tem categoria. O alias existe em vez do uso direto de `RecorteDePeriodo` para
 * que a assinatura de `listarReceitas` diga o que ela recebe, e para que um
 * filtro novo (moeda, faixa de valor) tenha onde entrar sem mexer no tipo
 * compartilhado.
 */
export type FiltroDeReceitas = RecorteDePeriodo

// =============================================================================
// A cotação do dólar, do lado do servidor.
//
// É a gêmea de `src/shared/lib/cotacao.ts`, que faz o mesmo para o formulário de
// Gastos e o de Receitas. As duas existem, e não é duplicação por descuido: são
// **dois processos diferentes**, um no navegador e outro no Deno da Edge
// Function, e uma Edge Function não importa do `src/` do front (o deploy sobe só
// a pasta `supabase/functions/`).
//
// O que é igual, e tem de continuar igual: a semântica do número (quantos reais
// vale 1 unidade da moeda), a ordem das fontes e o fato de FALHAR EM SILÊNCIO,
// devolvendo null.
//
// ## Por que a IA não pergunta a cotação ao usuário
//
// No formulário, quando as duas fontes falham, existe um campo manual — a pessoa
// está com a tela aberta e digita. Na conversa isso seria uma pergunta a mais
// antes de registrar um gasto, e a premissa do produto é que registrar custe uma
// frase. Então aqui o caminho é outro: cotação nula
// vira um erro que volta PARA O MODELO, que avisa o usuário em uma linha e
// registra em reais se ele disser o valor.
// =============================================================================
import type { Moeda } from './comum.ts'

/** Quantos milissegundos esperar antes de desistir de uma fonte. */
const TIMEOUT_MS = 5000

/**
 * As fontes, na ordem em que são tentadas: a primeira é a melhor, a segunda é a
 * que sobrevive.
 *
 * A AwesomeAPI é brasileira e devolve a cotação do **momento** (`bid`, o valor de
 * compra — o que precifica quem gastou em dólar). A exchangerate-api é atualizada
 * uma vez por dia, o que é pior, mas costuma estar de pé quando a outra não está.
 * Nenhuma das duas pede chave, e é por isso que a chamada pode acontecer sem
 * nenhum segredo envolvido.
 */
const FONTES: {
  url: (moeda: Moeda) => string
  extrair: (dados: unknown, moeda: Moeda) => unknown
}[] = [
  {
    url: (moeda) => `https://economia.awesomeapi.com.br/json/last/${moeda}-BRL`,
    // { "USDBRL": { "bid": "5.1602", ... } }
    extrair: (dados, moeda) => (dados as Record<string, { bid?: string }>)?.[`${moeda}BRL`]?.bid,
  },
  {
    url: (moeda) => `https://open.er-api.com/v6/latest/${moeda}`,
    // { "rates": { "BRL": 5.16, ... } }
    extrair: (dados) => (dados as { rates?: Record<string, number> })?.rates?.BRL,
  },
]

/**
 * Quantos reais vale 1 unidade de `moeda`. `null` se nenhuma fonte responder.
 *
 * `BRL` devolve `null` de propósito, e não `1`: em real não existe conversão a
 * fazer, e `expense.exchange_rate` é justamente nula nesse caso — o banco recusa
 * a linha que traga cotação num gasto em reais.
 */
export async function buscarCotacao(moeda: Moeda): Promise<number | null> {
  if (moeda === 'BRL') return null

  for (const fonte of FONTES) {
    try {
      const resposta = await fetch(fonte.url(moeda), { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!resposta.ok) continue

      // As duas APIs devolvem o número ora como texto, ora como número. `Number()`
      // resolve as duas, e a validação abaixo é o que impede um NaN (ou um zero de
      // resposta degradada) de virar uma cotação e zerar o valor do gasto.
      const cotacao = Number(fonte.extrair(await resposta.json(), moeda))
      if (Number.isFinite(cotacao) && cotacao > 0) return cotacao
    } catch {
      // Rede fora, timeout, JSON quebrado: tenta a próxima. Sem console.error —
      // quem trata a falha é quem chamou, e o log da função não deve encher de
      // ruído por uma API de terceiro instável.
    }
  }

  return null
}

/**
 * A cotação a gravar no lançamento: a que o modelo mandou, ou a do momento.
 *
 * O modelo pode informar uma (o usuário disse "a 5,40"), e nesse caso ela é
 * respeitada — é a cotação que a pessoa de fato usou. Só quando ela falta é que a
 * rede é consultada.
 *
 * Estourar em vez de devolver null quando tudo falha é escolha: o erro volta para
 * o modelo como resultado da ferramenta, e ele avisa o usuário. Gravar sem
 * cotação não é opção — o banco recusaria, e gravar com uma cotação inventada
 * seria pior do que recusar.
 */
export async function resolverCotacao(
  moeda: Moeda,
  informada: number | null,
): Promise<number | null> {
  if (moeda === 'BRL') return null
  if (informada !== null && informada > 0) return informada

  const buscada = await buscarCotacao(moeda)
  if (buscada === null) {
    throw new Error(
      'Não consegui a cotação do dólar agora. Avise o usuário e pergunte se ele quer registrar o valor direto em reais.',
    )
  }

  return buscada
}

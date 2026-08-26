import type { Moeda } from '@/shared/data/model'

/**
 * A cotação do dólar — a única chamada de rede deste sistema que não vai ao
 * Supabase.
 *
 * Mora em `shared/lib` porque é **integração com serviço externo**, na mesma
 * prateleira do `supabaseClient`. Gastos a usa hoje; Receitas e o Chat (quando
 * alguém disser "gastei 20 dólares no aeroporto") vão usar a mesma.
 *
 * ## O que ela devolve, e o que o banco faz com isso
 *
 * O número é **quantos reais vale 1 unidade da moeda** — 5.1602 significa
 * US$ 1,00 = R$ 5,1602. É exatamente a semântica da coluna `expense.exchange_rate`,
 * e é o banco que multiplica: o front manda valor, moeda e cotação, e a trigger
 * `expense_guard` calcula os reais. Aqui não se converte nada.
 *
 * ## Por que a cotação é buscada e depois GUARDADA na linha
 *
 * Cotação é um fato **datado**. O gasto de US$ 50 de março valeu o dólar de
 * março, e é esse valor que tem de aparecer no extrato de março para sempre. Se
 * a conversão fosse feita na leitura, com a cotação de hoje, o extrato mudaria de
 * valor sozinho toda manhã e nenhum mês fecharia com o anterior.
 *
 * ## Falhar aqui não pode travar o registro
 *
 * A premissa do produto é que registrar um gasto custe uma frase. Uma API de terceiro fora do ar não pode ser motivo para a
 * pessoa não conseguir lançar o que gastou — por isso esta função **devolve
 * `null` em vez de estourar**, e o formulário cai no campo de cotação manual,
 * que existe justamente para esse caso.
 */

/** Quantos milissegundos esperar antes de desistir de uma fonte. */
const TIMEOUT_MS = 6000

/**
 * As fontes, na ordem em que são tentadas.
 *
 * São duas, e não uma, porque a primeira é a melhor e a segunda é a que
 * sobrevive: a AwesomeAPI é brasileira e devolve a cotação do **momento**
 * (`bid`, o valor de compra — o que se usa para precificar quem gastou em
 * dólar); a exchangerate-api é atualizada uma vez por dia, o que é pior, mas
 * está de pé quando a outra não está. Nenhuma das duas pede chave, e é por isso
 * que a busca pode acontecer no front sem nada a esconder.
 *
 * Uma moeda nova entra aqui: as duas APIs já respondem por par/base, então basta
 * a moeda existir no enum `public.currency` e no `MOEDAS` abaixo.
 */
const FONTES: { url: (moeda: Moeda) => string; extrair: (dados: unknown, moeda: Moeda) => unknown }[] = [
  {
    url: (moeda) => `https://economia.awesomeapi.com.br/json/last/${moeda}-BRL`,
    // { "USDBRL": { "bid": "5.1602", ... } }
    extrair: (dados, moeda) =>
      (dados as Record<string, { bid?: string }>)?.[`${moeda}BRL`]?.bid,
  },
  {
    url: (moeda) => `https://open.er-api.com/v6/latest/${moeda}`,
    // { "rates": { "BRL": 5.16, ... } }
    extrair: (dados) => (dados as { rates?: Record<string, number> })?.rates?.BRL,
  },
]

/**
 * Busca quantos reais vale 1 unidade de `moeda`. `null` se nenhuma fonte
 * responder — quem chama trata isso como "peça a cotação ao usuário".
 *
 * `BRL` devolve `null` de propósito, e não `1`: em real não existe conversão a
 * fazer, e a coluna `exchange_rate` do banco é justamente nula nesse caso. Devolver
 * `1` faria a tela exibir uma cotação que ninguém consultou.
 */
export async function buscarCotacao(moeda: Moeda): Promise<number | null> {
  if (moeda === 'BRL') return null

  for (const fonte of FONTES) {
    try {
      const resposta = await fetch(fonte.url(moeda), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!resposta.ok) continue

      // As duas APIs devolvem o número como texto ou como número, conforme a
      // fonte. `Number()` resolve as duas, e a validação abaixo é o que impede
      // um `NaN` (ou um zero de resposta degradada) de virar uma cotação.
      const cotacao = Number(fonte.extrair(await resposta.json(), moeda))
      if (Number.isFinite(cotacao) && cotacao > 0) return cotacao
    } catch {
      // Rede fora, CORS, timeout, JSON quebrado: tenta a próxima fonte. Um
      // `console.error` aqui só encheria o console de quem está sem internet —
      // o formulário já mostra o campo manual quando as duas falham.
    }
  }

  return null
}

/**
 * As moedas aceitas, na ordem em que a tela as oferece — o espelho do enum
 * `public.currency` do banco.
 *
 * `simbolo` é o que aparece no seletor de moeda do formulário, onde não cabe o
 * nome inteiro. Não substitui `formatMoney`: **todo valor exibido** continua
 * passando pelo `Intl` (`src/shared/i18n/format.ts`), que sabe onde vai o
 * separador e o símbolo em cada idioma. Isto aqui é rótulo de botão, não formato
 * de dinheiro.
 */
export const MOEDAS: { codigo: Moeda; simbolo: string }[] = [
  { codigo: 'BRL', simbolo: 'R$' },
  { codigo: 'USD', simbolo: 'US$' },
]

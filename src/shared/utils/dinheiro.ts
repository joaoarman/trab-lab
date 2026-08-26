/**
 * A ponte entre o que a pessoa **digita** e o número em **reais** que o banco
 * guarda (coluna `numeric(12,2)`).
 *
 * Só o caminho de ENTRADA e a SOMA moram aqui. Para **exibir** um valor, use
 * `formatMoney` de `src/shared/i18n/format.ts`, que passa pelo `Intl` e acompanha
 * o idioma ativo.
 *
 * Fica em `shared/utils` porque não é de nenhuma tela: Gastos usa hoje, Receitas
 * vai usar igual, e o Chat vai precisar do mesmo entendimento quando alguém
 * escrever "gastei 1.250,90".
 */

/** O maior valor aceito pelo banco (`expense_amount_range`): R$ 9.999.999,99. */
export const VALOR_MAXIMO = 9999999.99

/** O menor: um centavo. Abaixo disso a escala da coluna arredondaria para zero. */
export const VALOR_MINIMO = 0.01

/**
 * O texto de um campo de valor → um número em reais, com 2 casas. `null` quando
 * não dá para ler um número dali.
 *
 * ## O problema dos dois separadores
 *
 * Este sistema roda em dois idiomas, e o mesmo campo recebe `1.250,90` de quem
 * está em português e `1,250.90` de quem está em inglês — com os papéis de ponto
 * e vírgula **trocados**. Chutar um dos dois erraria por mil vezes: `1.250` viraria
 * R$ 1,25 em vez de R$ 1.250,00.
 *
 * A regra que resolve os dois casos sem perguntar o idioma: **o último separador
 * que aparecer é o decimal** — desde que ele separe 1 ou 2 casas no fim. Todo o
 * resto é agrupamento de milhar e vai fora. `1.250,90` e `1,250.90` chegam aos
 * mesmos 1250.90, e `1.250` (sem decimais) é lido como mil duzentos e cinquenta,
 * que é o que quem digitou quis dizer.
 *
 * A montagem final passa por inteiros (`reais * 100 + centavos`, dividido no fim),
 * e não por `Number('1250.90')` direto: é o mesmo motivo de `somar()` logo abaixo
 * — em ponto flutuante, um `parseFloat` seguido de contas acumula erro, e o
 * caminho de duas divisões exatas não acumula nada.
 */
export function reaisDeTexto(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,-]/g, '').trim()
  if (limpo === '' || limpo.includes('-')) return null

  const ultimoSeparador = Math.max(limpo.lastIndexOf(','), limpo.lastIndexOf('.'))
  const casasDecimais = ultimoSeparador === -1 ? 0 : limpo.length - ultimoSeparador - 1

  // Um separador seguido de 1 ou 2 dígitos é decimal; qualquer outra coisa
  // (`1.250`, `1.250.000`) é agrupamento de milhar.
  const eDecimal = ultimoSeparador !== -1 && casasDecimais >= 1 && casasDecimais <= 2

  const inteira = (eDecimal ? limpo.slice(0, ultimoSeparador) : limpo).replace(/\D/g, '')
  const decimal = eDecimal ? limpo.slice(ultimoSeparador + 1).replace(/\D/g, '') : ''

  if (inteira === '' && decimal === '') return null

  // `padEnd` para que "5,5" seja cinquenta centavos a mais, e não cinco: quem
  // digita uma casa só está escrevendo décimos de real.
  const centavos = Number(inteira || '0') * 100 + Number(decimal.padEnd(2, '0') || '0')
  return Number.isSafeInteger(centavos) ? centavos / 100 : null
}

/**
 * Um valor em reais → o texto que vai **dentro do campo** ao abrir o formulário
 * de edição. Sempre com duas casas e vírgula decimal.
 *
 * Não passa pelo `Intl` de propósito: aqui não se quer um valor formatado (com
 * símbolo de moeda e separador de milhar), e sim algo que o próprio
 * `reaisDeTexto` leia de volta sem perder nada se a pessoa não mexer no campo.
 */
export function textoDeValor(valor: number): string {
  const centavos = Math.round(valor * 100)
  return `${Math.trunc(centavos / 100)},${String(Math.abs(centavos) % 100).padStart(2, '0')}`
}

/**
 * Soma valores em reais **sem erro de ponto flutuante**.
 *
 * O banco guarda `numeric`, que é decimal exato — mas o JavaScript só tem `number`
 * (binário, 64 bits), e é lá que a soma do total do período acontece. Somando
 * direto, `0.1 + 0.2` dá `0.30000000000000004`; num extrato de centenas de linhas
 * o resto sobe, e o total exibido pode fechar um centavo fora da soma que a pessoa
 * faz na calculadora — justamente o tipo de discrepância que destrói a confiança
 * num app de dinheiro.
 *
 * A saída é somar em **centavos inteiros** e dividir uma vez só no fim. Multiplicar
 * por 100 e arredondar é exato para qualquer valor com 2 casas, então o resultado é
 * o mesmo que o banco daria.
 */
export function somar(valores: number[]): number {
  return valores.reduce((total, valor) => total + Math.round(valor * 100), 0) / 100
}

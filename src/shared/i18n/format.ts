import i18n, { DEFAULT_LANGUAGE } from './index'

/**
 * Formatação localizada (número, data e moeda) via API nativa `Intl`, sempre no
 * idioma ATIVO do i18n. Use estes helpers em vez de montar valores na mão
 * (`R$ ${x}`, data como dia/mês/ano…) — assim o formato acompanha a troca de idioma.
 *
 * Precisou de um formato novo (percentual, tempo relativo, unidade…)? Adicione aqui.
 * A moeda padrão é definida por projeto: ajuste `DEFAULT_CURRENCY`.
 */
const DEFAULT_CURRENCY = 'BRL'

function activeLocale(): string {
  return i18n.language || DEFAULT_LANGUAGE
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(activeLocale(), options).format(value)
}

/**
 * Um valor em dinheiro, no idioma ativo.
 *
 * `options` existe para o caso em que duas casas decimais escondem a informação:
 * o custo de IA do módulo Log é fracionário em centavos de dólar, e uma mensagem
 * que custou US$ 0,000413 apareceria como "US$ 0,00" — indistinguível de "saiu de
 * graça", que é justamente o que aquela tela existe para não deixar acontecer.
 *
 * Fora esse caso, chame sem `options`: o padrão do `Intl` é o certo para dinheiro.
 */
export function formatMoney(
  value: number,
  currency: string = DEFAULT_CURRENCY,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency,
    ...options,
  }).format(value)
}

export function formatDate(
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(activeLocale(), options).format(date)
}

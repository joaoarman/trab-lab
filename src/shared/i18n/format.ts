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

export function formatMoney(value: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat(activeLocale(), { style: 'currency', currency }).format(value)
}

export function formatDate(
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(activeLocale(), options).format(date)
}

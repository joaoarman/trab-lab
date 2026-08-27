import i18n, { DEFAULT_LANGUAGE } from './index'

const DEFAULT_CURRENCY = 'BRL'

function activeLocale(): string {
  return i18n.language || DEFAULT_LANGUAGE
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(activeLocale(), options).format(value)
}

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

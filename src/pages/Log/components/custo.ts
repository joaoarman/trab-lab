import { formatMoney } from '@/shared/i18n/format'

// O banco guarda centavos de dólar, e uma linha custa frações de centavo.
export function custoDeIA(centavosDeDolar: number, escala: 'linha' | 'total'): string {
  const dolares = centavosDeDolar / 100

  return formatMoney(
    dolares,
    'USD',
    escala === 'linha'
      ? { minimumFractionDigits: 2, maximumFractionDigits: 6 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 4 },
  )
}

export const VALOR_MAXIMO = 9999999.99

export const VALOR_MINIMO = 0.01

// Aceita "1.234,56" e "1,234.56": o último separador com 1 ou 2 casas é o decimal.
export function reaisDeTexto(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,-]/g, '').trim()
  if (limpo === '' || limpo.includes('-')) return null

  const ultimoSeparador = Math.max(limpo.lastIndexOf(','), limpo.lastIndexOf('.'))
  const casasDecimais = ultimoSeparador === -1 ? 0 : limpo.length - ultimoSeparador - 1

  const eDecimal = ultimoSeparador !== -1 && casasDecimais >= 1 && casasDecimais <= 2

  const inteira = (eDecimal ? limpo.slice(0, ultimoSeparador) : limpo).replace(/\D/g, '')
  const decimal = eDecimal ? limpo.slice(ultimoSeparador + 1).replace(/\D/g, '') : ''

  if (inteira === '' && decimal === '') return null

  const centavos = Number(inteira || '0') * 100 + Number(decimal.padEnd(2, '0') || '0')
  return Number.isSafeInteger(centavos) ? centavos / 100 : null
}

export function textoDeValor(valor: number): string {
  const centavos = Math.round(valor * 100)
  return `${Math.trunc(centavos / 100)},${String(Math.abs(centavos) % 100).padStart(2, '0')}`
}

// Soma em centavos inteiros: em float, 0.1 + 0.2 não dá 0.3.
export function somar(valores: number[]): number {
  return valores.reduce((total, valor) => total + Math.round(valor * 100), 0) / 100
}

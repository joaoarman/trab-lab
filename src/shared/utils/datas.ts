// Toda conta de data do app é no fuso local do navegador.
import type { RecorteDePeriodo } from '@/shared/data/model'

export const ATALHOS = ['esteMes', 'mesPassado', 'ultimos30', 'esteAno'] as const

export type Atalho = (typeof ATALHOS)[number]

export type PeriodoEscolhido = Atalho | 'personalizado'

function paraData(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

export function periodoDe(atalho: Atalho, hoje: Date = new Date()): RecorteDePeriodo {
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()

  switch (atalho) {
    case 'esteMes':
      return { de: paraData(new Date(ano, mes, 1)), ate: paraData(new Date(ano, mes + 1, 0)) }
    case 'mesPassado':
      return { de: paraData(new Date(ano, mes - 1, 1)), ate: paraData(new Date(ano, mes, 0)) }
    case 'ultimos30':
      return { de: paraData(new Date(ano, mes, hoje.getDate() - 29)), ate: paraData(hoje) }
    case 'esteAno':
      return { de: paraData(new Date(ano, 0, 1)), ate: paraData(new Date(ano, 11, 31)) }
  }
}

export function inicioDoDia(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia).toISOString()
}

// Limite superior exclusivo: usar com .lt(), nunca com .lte().
export function inicioDoDiaSeguinte(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia + 1).toISOString()
}

export function paraCampoDeDataHora(data: Date): string {
  const doisDigitos = (numero: number) => String(numero).padStart(2, '0')
  return (
    `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}` +
    `T${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`
  )
}

export function dataLocal(valor: Date | string = new Date()): string {
  return paraData(valor instanceof Date ? valor : new Date(valor))
}

export function deslocarData(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return paraData(new Date(ano, mes - 1, dia + dias))
}

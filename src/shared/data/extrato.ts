import { formatDate } from '@/shared/i18n/format'
import { somar } from '@/shared/utils/dinheiro'

export interface DiaDeLancamentos<T> {
  data: string
  total: number
  lancamentos: T[]
}

// Espera a lista já ordenada: só compara com o último dia aberto.
export function agruparPorDia<T>(
  lancamentos: T[],
  quando: (lancamento: T) => string,
  valor: (lancamento: T) => number,
): DiaDeLancamentos<T>[] {
  const dias: DiaDeLancamentos<T>[] = []

  for (const lancamento of lancamentos) {
    const data = new Date(quando(lancamento))
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(
      data.getDate(),
    ).padStart(2, '0')}`

    const atual = dias[dias.length - 1]
    if (atual?.data === chave) atual.lancamentos.push(lancamento)
    else dias.push({ data: chave, total: 0, lancamentos: [lancamento] })
  }

  for (const dia of dias) {
    dia.total = somar(dia.lancamentos.map(valor))
  }

  return dias
}

export function rotuloDoDia(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return formatDate(new Date(ano, mes - 1, dia), {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

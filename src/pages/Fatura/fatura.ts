import type { Lancamento } from '@/shared/data/model'
import { somar } from '@/shared/utils/dinheiro'

export function chaveDoLancamento(lancamento: Lancamento): string {
  return `${lancamento.tipo}-${lancamento.id}`
}

export function valorComSinal(lancamento: Lancamento): number {
  return lancamento.tipo === 'RECEITA' ? lancamento.valorEmBrl : -lancamento.valorEmBrl
}

export interface TotaisDaFatura {
  entrou: number
  saiu: number
  saldo: number
}

export function totaisDaFatura(lancamentos: Lancamento[]): TotaisDaFatura {
  const entrou = somar(
    lancamentos.filter((l) => l.tipo === 'RECEITA').map((l) => l.valorEmBrl),
  )
  const saiu = somar(lancamentos.filter((l) => l.tipo === 'GASTO').map((l) => l.valorEmBrl))
  return { entrou, saiu, saldo: somar([entrou, -saiu]) }
}

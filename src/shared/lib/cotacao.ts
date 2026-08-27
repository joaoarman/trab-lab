import type { Moeda } from '@/shared/data/model'

const TIMEOUT_MS = 6000

const FONTES: { url: (moeda: Moeda) => string; extrair: (dados: unknown, moeda: Moeda) => unknown }[] = [
  {
    url: (moeda) => `https://economia.awesomeapi.com.br/json/last/${moeda}-BRL`,
    extrair: (dados, moeda) =>
      (dados as Record<string, { bid?: string }>)?.[`${moeda}BRL`]?.bid,
  },
  {
    url: (moeda) => `https://open.er-api.com/v6/latest/${moeda}`,
    extrair: (dados) => (dados as { rates?: Record<string, number> })?.rates?.BRL,
  },
]

export async function buscarCotacao(moeda: Moeda): Promise<number | null> {
  if (moeda === 'BRL') return null

  for (const fonte of FONTES) {
    try {
      const resposta = await fetch(fonte.url(moeda), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!resposta.ok) continue

      const cotacao = Number(fonte.extrair(await resposta.json(), moeda))
      if (Number.isFinite(cotacao) && cotacao > 0) return cotacao
    } catch {
      // fonte fora do ar ou resposta inesperada: tenta a próxima
    }
  }

  return null
}

export const MOEDAS: { codigo: Moeda; simbolo: string }[] = [
  { codigo: 'BRL', simbolo: 'R$' },
  { codigo: 'USD', simbolo: 'US$' },
]

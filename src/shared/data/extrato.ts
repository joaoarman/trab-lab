import { formatDate } from '@/shared/i18n/format'
import { somar } from '@/shared/utils/dinheiro'

/**
 * O que transforma uma lista corrida de lançamentos em **extrato**: o
 * agrupamento por dia, com o total de cada dia.
 *
 * Mora em `shared/data` pelo mesmo motivo de `arvoreDeCategorias.ts` — é regra de
 * domínio compartilhada, não componente nem query. Gastos e Receitas desenham a
 * mesma lista, e o Chat vai precisar da mesma conta ao responder "quanto gastei
 * na sexta?".
 *
 * Sem esse agrupamento, "gastei muito na sexta?" só se responde somando as linhas
 * de cabeça — que é exatamente o trabalho que um app de dinheiro existe para
 * tirar da frente.
 */

/** Um dia do extrato: a data, o total e os lançamentos daquele dia. */
export interface DiaDeLancamentos<T> {
  /** `YYYY-MM-DD`, no fuso de quem está olhando. */
  data: string
  total: number
  lancamentos: T[]
}

/**
 * Os lançamentos agrupados por dia, **preservando a ordem que veio do banco**
 * (do mais recente para o mais antigo).
 *
 * Genérica nos dois eixos que mudam entre os módulos: `quando` diz qual data
 * agrupa (`ocorreuEm` no gasto, `recebidaEm` na receita) e `valor` diz o que
 * somar. Os dois são sempre a data do **fato** e o valor **em reais** — somar
 * `valor` em vez de `valorEmBrl` colocaria dólar e real na mesma conta.
 *
 * ## A chave é a data LOCAL, e não `iso.slice(0, 10)`
 *
 * A string do banco vem em UTC, e um gasto das 22h em Brasília cairia no dia
 * seguinte: apareceria sob um cabeçalho de amanhã, e o total daquele dia sairia
 * errado.
 *
 * ## O total de cada dia sai de `somar`, e depois do grupo fechado
 *
 * Um `+=` dentro do laço acumularia o erro de ponto flutuante que `somar`
 * (`shared/utils/dinheiro.ts`) existe para evitar — o `number` do JavaScript é
 * binário, e um extrato que fecha um centavo fora da calculadora da pessoa
 * destrói a confiança no app inteiro.
 */
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

    // A lista já chega ordenada, então o dia corrente é sempre o último criado:
    // basta olhar o fim, sem Map nem reordenação depois.
    const atual = dias[dias.length - 1]
    if (atual?.data === chave) atual.lancamentos.push(lancamento)
    else dias.push({ data: chave, total: 0, lancamentos: [lancamento] })
  }

  for (const dia of dias) {
    dia.total = somar(dia.lancamentos.map(valor))
  }

  return dias
}

/**
 * `2026-08-26` → "ter., 26 de agosto de 2026" (ou o equivalente no idioma ativo).
 *
 * Anda junto de `agruparPorDia` porque é o único lugar que sabe ler a chave que
 * ela produz: o formato `YYYY-MM-DD` é detalhe de implementação do agrupamento, e
 * separar as duas deixaria uma string mágica atravessando a fronteira.
 *
 * `new Date(ano, mes - 1, dia)` monta a meia-noite **local**. `new Date(data)`
 * com a string crua leria a data como UTC e, no fuso de Brasília, o rótulo
 * apareceria com o dia anterior.
 */
export function rotuloDoDia(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return formatDate(new Date(ano, mes - 1, dia), {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

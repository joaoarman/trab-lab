import type { RecorteDePeriodo } from '@/shared/data/model'

/**
 * Todas as contas de data do app — **sempre no fuso de quem está olhando**.
 *
 * Três coisas moram aqui: os atalhos do filtro de período ("este mês"), a ponte
 * entre as duas datas do filtro e os limites `timestamptz` da consulta, e a
 * conversão para o campo de data e hora dos formulários. Funções puras, sem rede
 * e sem estado.
 *
 * ## Por que isto é `shared/utils` e não a pasta de um módulo
 *
 * Nasceu como `pages/Gastos/periodo.ts`, com a anotação de que subiria para cá
 * assim que Receitas precisasse do mesmo. Precisou: as duas telas têm o mesmo
 * filtro de período e o mesmo campo de data e hora, e a alternativa seria manter
 * duas cópias de "quando começa o mês passado" e de "meia-noite local, não de
 * Londres" — duas cópias que divergem no dia em que alguém corrigir uma só. O
 * Chat vai usar as mesmas contas ao responder "quanto gastei esse mês?".
 *
 * O que continua morando em cada módulo é a **query**: o `supabase.ts` de Gastos
 * e o de Receitas montam a sua, cada um com a sua tabela e a sua coluna de data.
 * O que sobe para cá é só a aritmética de datas, que é igual para os dois.
 *
 * ## Os atalhos existem porque quase todo uso é "o mês"
 *
 * A pessoa abre a tela para conferir o que já entrou ou saiu, e só de vez em
 * quando quer um recorte diferente. Obrigar a escolher duas datas para a
 * pergunta mais comum é exatamente a fricção que este sistema existe para
 * eliminar.
 *
 * ## Tudo em data LOCAL, nunca em UTC
 *
 * As datas trafegam como `YYYY-MM-DD` porque é o formato do `<input type="date">`.
 * A conversão usa os componentes locais do `Date` (`getFullYear`/`getMonth`/
 * `getDate`), e **não** `toISOString().slice(0, 10)`: no fuso de Brasília, quem
 * abre a tela às 22h de 31 de agosto veria o ISO já apontando para 1º de
 * setembro, e o filtro "este mês" nasceria no mês errado.
 */

/** Os recortes prontos, na ordem em que o seletor os lista. */
export const ATALHOS = ['esteMes', 'mesPassado', 'ultimos30', 'esteAno'] as const

export type Atalho = (typeof ATALHOS)[number]

/** O recorte que a lista está mostrando: um atalho, ou datas escolhidas à mão. */
export type PeriodoEscolhido = Atalho | 'personalizado'

/** `Date` → `YYYY-MM-DD`, no fuso de quem está olhando. */
function paraData(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

/**
 * As duas datas de um atalho.
 *
 * `new Date(ano, mes + 1, 0)` é o último dia do mês `mes`: o dia 0 do mês
 * seguinte. O construtor normaliza sozinho, então não é preciso saber quantos
 * dias tem cada mês nem se o ano é bissexto — e a virada de dezembro para janeiro
 * também se resolve sem `if`.
 */
export function periodoDe(atalho: Atalho, hoje: Date = new Date()): RecorteDePeriodo {
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()

  switch (atalho) {
    case 'esteMes':
      return { de: paraData(new Date(ano, mes, 1)), ate: paraData(new Date(ano, mes + 1, 0)) }
    case 'mesPassado':
      return { de: paraData(new Date(ano, mes - 1, 1)), ate: paraData(new Date(ano, mes, 0)) }
    case 'ultimos30':
      // 29, e não 30: o período é fechado nas duas pontas, então hoje conta como
      // um dos trinta dias. Com 30 seriam trinta e um.
      return { de: paraData(new Date(ano, mes, hoje.getDate() - 29)), ate: paraData(hoje) }
    case 'esteAno':
      return { de: paraData(new Date(ano, 0, 1)), ate: paraData(new Date(ano, 11, 31)) }
  }
}

// --- O período, em ISO ------------------------------------------------------
//
// A ponte entre as duas datas do filtro e as colunas `timestamptz` do banco
// (`expense.occurred_at`, `income.received_at`). As duas funções fazem a
// conversão NO FUSO DO USUÁRIO: `new Date(2026, 7, 1)` monta a meia-noite local,
// e `toISOString()` a converte para UTC na hora de mandar. Escrever a string à
// mão ('2026-08-01T00:00:00Z') entregaria a meia-noite de Londres, e quem está em
// Brasília perderia as três primeiras horas do primeiro dia do filtro.

/** O começo do dia — o limite FECHADO do filtro (`>=`). */
export function inicioDoDia(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia).toISOString()
}

/**
 * O começo do dia seguinte — o limite ABERTO do filtro (`<`).
 *
 * É o que faz o último dia do período entrar INTEIRO. Comparar
 * `occurred_at <= '2026-08-31'` deixaria de fora tudo o que aconteceu depois da
 * meia-noite daquele dia — ou seja, o último dia do mês inteiro, silenciosamente.
 *
 * `new Date(ano, mes, dia + 1)` com o dia 31 vira o dia 1 do mês que vem sozinho:
 * o construtor normaliza o estouro, e não é preciso saber quantos dias tem o mês
 * nem se o ano é bissexto.
 */
export function inicioDoDiaSeguinte(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia + 1).toISOString()
}

/**
 * `Date` → o texto que o `<input type="datetime-local">` entende
 * (`YYYY-MM-DDTHH:mm`), **no fuso de quem está olhando**.
 *
 * `toISOString()` não serve aqui: ele converte para UTC, e em Brasília o "agora"
 * de um lançamento registrado às 21h apareceria no campo como meia-noite do dia
 * seguinte. O caminho de volta é `new Date(texto)`, que lê a string sem fuso como
 * hora local — as duas pontas concordam, e o ISO só aparece na hora de mandar
 * para o banco.
 */
export function paraCampoDeDataHora(data: Date): string {
  const doisDigitos = (numero: number) => String(numero).padStart(2, '0')
  return (
    `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}` +
    `T${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`
  )
}

// --- O dia de um instante --------------------------------------------------
//
// As duas funções abaixo respondem à mesma pergunta que os atalhos respondem, mas
// para um instante solto: "de que DIA é isto, no fuso de quem está olhando?".
//
// Quem precisa: o separador de datas do Chat ("Hoje", "Ontem", "31/07/2026") e o
// que a tela manda para a IA como data de hoje — é ela que resolve "ontem" e
// "sexta passada" no prompt, e o servidor não pode resolvê-la sozinho porque roda
// em UTC (viraria o dia às 21h de Brasília).

/**
 * O dia de um instante em `YYYY-MM-DD`, **no fuso local**.
 *
 * `toISOString().slice(0, 10)` não serve: ele converte para UTC, e uma mensagem
 * das 22h em Brasília apareceria sob o cabeçalho do dia seguinte.
 */
export function dataLocal(valor: Date | string = new Date()): string {
  return paraData(valor instanceof Date ? valor : new Date(valor))
}

/**
 * A data `dias` adiante (ou atrás, com número negativo).
 *
 * `new Date(ano, mes - 1, dia + n)` normaliza o estouro sozinho: o dia 0 de
 * setembro vira 31 de agosto, e a virada de ano se resolve sem `if`.
 */
export function deslocarData(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return paraData(new Date(ano, mes - 1, dia + dias))
}

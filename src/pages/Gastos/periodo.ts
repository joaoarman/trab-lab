/**
 * Os atalhos de período do filtro — funções puras, sem rede e sem estado.
 *
 * Existem porque **quase todo uso desta tela é "o mês"**: a pessoa abre para
 * conferir o que já gastou, e só de vez em quando quer um recorte diferente.
 * Obrigar a escolher duas datas para a pergunta mais comum é exatamente a
 * fricção que este sistema existe para eliminar.
 *
 * ## Tudo em data LOCAL, nunca em UTC
 *
 * As datas trafegam como `YYYY-MM-DD` porque é o formato do `<input type="date">`.
 * A conversão usa os componentes locais do `Date` (`getFullYear`/`getMonth`/
 * `getDate`), e **não** `toISOString().slice(0, 10)`: no fuso de Brasília, quem
 * abre a tela às 22h de 31 de agosto veria o ISO já apontando para 1º de
 * setembro, e o filtro "este mês" nasceria no mês errado.
 *
 * Quem transforma essas datas nos limites `timestamptz` da consulta é o
 * `supabase.ts` do módulo — e é lá que está a explicação de por que o fim do
 * período vira o começo do dia seguinte.
 */

/** Os recortes prontos, na ordem em que o seletor os lista. */
export const ATALHOS = ['esteMes', 'mesPassado', 'ultimos30', 'esteAno'] as const

export type Atalho = (typeof ATALHOS)[number]

/** O recorte que a lista está mostrando: um atalho, ou datas escolhidas à mão. */
export type PeriodoEscolhido = Atalho | 'personalizado'

/** As duas pontas de um recorte. Interna: quem chama espalha o objeto direto. */
interface Periodo {
  de: string
  ate: string
}

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
export function periodoDe(atalho: Atalho, hoje: Date = new Date()): Periodo {
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

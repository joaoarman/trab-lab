import { formatMoney } from '@/shared/i18n/format'

/**
 * O custo de IA na tela — de CENTAVOS de dólar (como o banco guarda) para uma
 * quantia legível.
 *
 * ## Por que o banco guarda centavos e a tela mostra dólares
 *
 * `ai_log.cost_usd_cents` é `numeric(12,6)`: centavos de dólar com seis casas.
 * Foi escolhido para o valor que se GRAVA — uma chamada custa uma fração de
 * centavo, e em centavos essa fração cabe numa escala razoável. Mas ninguém lê
 * dinheiro em centavos de dólar; lê em dólares. A conversão é uma divisão por 100,
 * e ela mora aqui para não se repetir (nem divergir) entre a linha e o rodapé.
 *
 * ## A precisão muda com a grandeza, e isso é o ponto
 *
 * Uma mensagem custa US$ 0,0004. Um mês custa US$ 0,42. Formatar as duas com as
 * duas casas do padrão faria a primeira aparecer como **US$ 0,00** — que se lê
 * como "saiu de graça", exatamente o contrário do que esta tela existe para
 * mostrar. Então:
 *
 * - `'linha'` — até 6 casas: o custo de UMA mensagem, onde cada zero importa;
 * - `'total'` — até 4 casas, com 2 no mínimo: o total do período, onde a leitura
 *   normal de dinheiro é a que serve, mas um período curto ainda precisa não
 *   arredondar para zero.
 *
 * Os dois passam por `formatMoney` (o `Intl` do idioma ativo), nunca por
 * concatenação — a mesma regra vale para dólar como vale para
 * real.
 */
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

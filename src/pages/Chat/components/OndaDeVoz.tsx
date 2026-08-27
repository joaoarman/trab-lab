/**
 * A onda que se mexe conforme a pessoa fala.
 *
 * São barras verticais finas que crescem com o volume do microfone, e a fila
 * inteira **desliza para a esquerda** — a barra nova entra na direita, a mais
 * velha sai. O efeito é o de uma onda correndo, e ele existe por um motivo
 * prático: é a única prova, na tela, de que o microfone está captando. Um
 * cronômetro sobe igual no silêncio e na fala.
 *
 * ## Largura fixa, alinhada à esquerda
 *
 * Cada barra tem 3px, com 3px de vão, e a fila começa logo depois do cronômetro.
 * Ela **não se estica** para chegar aos botões: o espaço que sobra à direita fica
 * vazio mesmo. O que dá o aspecto de onda é a **densidade** das barras, não a
 * largura que elas cobrem — esticá-las as engorda até virarem blocos no desktop.
 *
 * Desenhada em `div`s, e não em canvas: são 32 elementos com uma transição de
 * altura, o que o navegador resolve na GPU e o leitor de tela simplesmente ignora
 * (`aria-hidden` — quem não enxerga a onda tem o cronômetro ao lado, que é
 * anunciado).
 *
 * A altura mínima de 10% mantém a linha viva nas pausas da fala: uma fileira de
 * barras zeradas parece o gravador ter travado.
 */
export function OndaDeVoz({ niveis }: { niveis: number[] }) {
  return (
    <div aria-hidden className="flex h-8 w-full items-center gap-[3px] overflow-hidden">
      {niveis.map((nivel, indice) => (
        <span
          // O índice como chave é o certo AQUI: a lista é uma janela de tempo de
          // tamanho fixo, e cada posição é um instante — não uma identidade que se
          // move. Reaproveitar o elemento da posição é o que faz a altura animar
          // em vez de piscar.
          key={indice}
          // `shrink-0` mantém a largura fixa: sem ele o flex espremeria as barras
          // numa tela estreita e a densidade mudaria com o tamanho do aparelho.
          className="w-[3px] shrink-0 rounded-full bg-primary transition-[height] duration-100 ease-out"
          style={{ height: `${Math.max(10, nivel * 100)}%` }}
        />
      ))}
    </div>
  )
}

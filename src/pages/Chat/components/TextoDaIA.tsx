import { Fragment, type ReactNode } from 'react'

/**
 * O texto da IA na tela — com o pouco de formatação que ela usa, e só isso.
 *
 * A IA responde com **negrito** nos valores ("você gastou **R$ 842,30** com
 * Carro"), porque é o que faz o número saltar numa frase lida de relance. Sem
 * interpretar nada, o usuário leria os asteriscos crus.
 *
 * ## POR QUE NÃO UMA BIBLIOTECA DE MARKDOWN
 *
 * Duas razões, e a segunda é a que decide. A primeira é peso: um renderizador
 * completo traz tabelas, links, imagens e HTML embutido para servir a dois
 * asteriscos.
 *
 * A segunda é que **o texto vem de um modelo de linguagem** — é conteúdo gerado,
 * influenciável pelo que o usuário escreve e pelo que está guardado no banco (o
 * nome de um gasto entra no contexto da IA). Interpretar markdown completo abriria
 * a porta para uma resposta desenhar um link ou um bloco de HTML dentro da tela do
 * app. Aqui não existe essa porta: o resultado é uma árvore de `<strong>` e texto,
 * montada elemento a elemento, sem `dangerouslySetInnerHTML` em lugar nenhum.
 *
 * O que se interpreta, portanto: **negrito** e quebra de linha. Nada mais.
 */

/** Quebra a linha em pedaços de texto e de negrito, sem regex sobre HTML. */
function comNegrito(linha: string): ReactNode[] {
  // O split com grupo de captura mantém os delimitadores: os índices ímpares são o
  // conteúdo que estava entre os pares de asteriscos.
  const pedacos = linha.split(/\*\*(.+?)\*\*/g)

  return pedacos.map((pedaco, indice) =>
    indice % 2 === 1 ? (
      <strong key={indice} className="font-semibold">
        {pedaco}
      </strong>
    ) : (
      <Fragment key={indice}>{pedaco}</Fragment>
    ),
  )
}

export function TextoDaIA({ texto }: { texto: string }) {
  const linhas = texto.split('\n')

  return (
    <>
      {linhas.map((linha, indice) => (
        <Fragment key={indice}>
          {indice > 0 && <br />}
          {comNegrito(linha)}
        </Fragment>
      ))}
    </>
  )
}

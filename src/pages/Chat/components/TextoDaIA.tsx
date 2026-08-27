import { Fragment, type ReactNode } from 'react'

function comNegrito(linha: string): ReactNode[] {
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

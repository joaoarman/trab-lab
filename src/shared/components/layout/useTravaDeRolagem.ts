import { useEffect } from 'react'

/**
 * Trava a rolagem da JANELA enquanto `ativa` for verdadeira.
 *
 * Serve a duas situações do shell, pelo mesmo motivo: a gaveta de navegação
 * aberta (rolar o fundo por trás de um painel é desorientador) e as rotas em que
 * a página é a tela inteira e rola por dentro (o Chat).
 *
 * É a SEGUNDA tranca, não a única. A primeira é o `fixed` do AppLayout, que tira
 * o shell do fluxo do documento — sem altura, não há o que rolar. Esta aqui pega
 * o que escapa: conteúdo que o navegador ainda considere rolável no `<html>`/
 * `<body>`, e o arrasto elástico do iOS.
 *
 * Guarda e devolve o valor anterior em vez de escrever `''` na saída: se um dia
 * dois lugares travarem a rolagem ao mesmo tempo (gaveta aberta dentro do chat),
 * o que sair por último não pode desfazer o que o outro ainda precisa.
 */
export function useTravaDeRolagem(ativa: boolean) {
  useEffect(() => {
    if (!ativa) return

    const raiz = document.documentElement
    const corpo = document.body
    const anterior = { raiz: raiz.style.overflow, corpo: corpo.style.overflow }

    raiz.style.overflow = 'hidden'
    corpo.style.overflow = 'hidden'

    return () => {
      raiz.style.overflow = anterior.raiz
      corpo.style.overflow = anterior.corpo
    }
  }, [ativa])
}

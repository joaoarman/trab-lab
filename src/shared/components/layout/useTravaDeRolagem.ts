import { useEffect } from 'react'

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

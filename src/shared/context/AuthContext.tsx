import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/shared/lib/supabaseClient'
import { buscarPerfil, garantirPerfil, sair } from '@/pages/Auth/supabase'
import type { Perfil } from '@/shared/data/model'

interface AuthContextValue {
  session: Session | null
  perfil: Perfil | null
  carregando: boolean
  recarregarPerfil: () => Promise<void>
  sairDaConta: (escopo?: 'local' | 'global' | 'others') => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  const [sessaoResolvida, setSessaoResolvida] = useState(false)

  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return
      setSession(data.session)
      setSessaoResolvida(true)
    })

    const { data: inscricao } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      if (!ativo) return
      setSession(novaSessao)
      setSessaoResolvida(true)
    })

    return () => {
      ativo = false
      inscricao.subscription.unsubscribe()
    }
  }, [])

  const carregarPerfil = useCallback(async () => {
    let dados = await buscarPerfil()

    if (!dados) dados = await garantirPerfil()

    if (dados?.desativadoEm) {
      await sair('global')
      setPerfil(null)
      return
    }

    setPerfil(dados)
  }, [])

  useEffect(() => {
    if (!sessaoResolvida) return

    if (!session) {
      setPerfil(null)
      setPronto(true)
      return
    }

    let ativo = true

    carregarPerfil()
      .catch(() => {
        // falhar em carregar o perfil não pode travar a tela; o finally libera
      })
      .finally(() => {
        if (ativo) setPronto(true)
      })

    return () => {
      ativo = false
    }
  }, [session, sessaoResolvida, carregarPerfil])

  const recarregarPerfil = useCallback(async () => {
    if (!session) return
    await carregarPerfil()
  }, [session, carregarPerfil])

  const sairDaConta = useCallback(async (escopo: 'local' | 'global' | 'others' = 'local') => {
    await sair(escopo)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        perfil,
        carregando: !pronto,
        recarregarPerfil,
        sairDaConta,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const contexto = useContext(AuthContext)
  if (!contexto) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return contexto
}

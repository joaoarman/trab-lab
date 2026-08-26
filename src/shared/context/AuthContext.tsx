import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/shared/lib/supabaseClient'
import { buscarPerfil, garantirPerfil, sair } from '@/pages/Auth/supabase'
import type { Perfil } from '@/shared/data/model'

/**
 * A sessão do usuário — quem está logado e qual o perfil dele.
 *
 * É o provider que a guarda de rota consulta (`RotaProtegida`), e de onde o
 * menu do usuário tira nome, e-mail e foto.
 *
 * ## Duas coisas que ele existe para não deixar acontecer
 *
 * **1. Ficar "logado e quebrado".** Se a renovação do token falha — a sessão foi
 * revogada, a senha mudou noutro aparelho, a conta foi desativada — o app não
 * pode continuar exibindo a interface como se nada fosse, com toda ação
 * retornando erro. O `onAuthStateChange` derruba a sessão e a guarda manda para
 * o login.
 *
 * **2. Conta desativada continuar navegando.** Desativar a conta (`deleted_at`)
 * NÃO invalida o token que já foi emitido: ele vale até expirar. Então, sempre
 * que o perfil é carregado, se ele vier desativado a sessão é encerrada em TODOS
 * os aparelhos (`global`) — sem isso a pessoa seguiria usando o sistema por até
 * uma hora depois de a conta ser fechada.
 */
interface AuthContextValue {
  /** A sessão do Supabase, ou null se ninguém está logado. */
  session: Session | null
  /** O perfil do usuário logado. Null enquanto carrega ou se não há sessão. */
  perfil: Perfil | null
  /** True enquanto o estado inicial ainda não foi resolvido. */
  carregando: boolean
  /** Relê o perfil do banco (após salvar a tela de conta, por exemplo). */
  recarregarPerfil: () => Promise<void>
  /** Sai. `escopo` só é diferente de 'local' ao fim das trocas de credencial. */
  sairDaConta: (escopo?: 'local' | 'global' | 'others') => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  // A sessão foi lida ao menos uma vez (o Supabase lendo o localStorage). Antes
  // disso, "não há sessão" e "ainda não sei" são indistinguíveis — e decidir no
  // meio mostraria a tela de login para quem está logado.
  const [sessaoResolvida, setSessaoResolvida] = useState(false)

  /*
    `pronto` vale para o PRIMEIRO carregamento e nunca volta a ser falso.

    A guarda de rota troca o app inteiro por uma tela de espera enquanto
    `carregando` for verdadeiro. Isso é certo na abertura, mas a sessão muda
    várias vezes DEPOIS dela: o token se renova sozinho (a cada hora) e as trocas
    de senha e de e-mail re-autenticam no meio do caminho. Se `carregando`
    voltasse a ser verdadeiro a cada uma, o app seria desmontado e trocado por um
    spinner no meio de um formulário preenchido, sem aviso. Dessas vezes em
    diante o perfil é relido em silêncio, com a tela no ar.
  */
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return
      setSession(data.session)
      setSessaoResolvida(true)
    })

    /*
      A partir daqui, quem manda no estado da sessão é este ouvinte: login,
      logout, renovação do token e falha de renovação passam todos por ele.

      O callback é SÍNCRONO de propósito. O supabase-js o chama de dentro de um
      lock interno, e chamar outro método do cliente aqui dentro (buscar o
      perfil, por exemplo) pode travar os dois esperando um ao outro. Por isso o
      perfil é carregado num efeito separado, disparado pela mudança de `session`.
    */
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

    // Logado sem perfil: a rede de segurança. Acontece se o trigger de cadastro
    // tiver engolido uma exceção (ele prefere deixar a conta nascer sem perfil a
    // impedir o cadastro).
    if (!dados) dados = await garantirPerfil()

    // Conta desativada → cai fora de todos os aparelhos, não só deste. O ban no
    // Supabase não invalida um token já emitido: sem isto, a pessoa seguiria
    // usando o sistema por até uma hora depois de a conta ser fechada.
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
        // Uma falha de leitura (a rede caiu) não derruba a sessão nem apaga o
        // perfil que já estava na tela: o app segue com o que tem, e a próxima
        // leitura corrige. Zerar aqui esvaziaria a tela de conta no meio do uso.
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
    // 'others' mantém ESTA sessão viva de propósito — é a opção "sair de todas
    // menos esta". Nos outros escopos o `onAuthStateChange` já zera o estado.
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

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { useAuth } from '@/shared/context/AuthContext'

/**
 * As rotas da porta de entrada, nomeadas.
 *
 * Elas ficam de fora do `navigation.ts` de propósito: aquele arquivo é o mapa do
 * que o usuário navega, e login e cadastro não são destinos do sistema — são o
 * lado de fora dele. Mas continuam sendo referenciadas em mais de um lugar (a
 * guarda, e o link de uma tela para a outra), e é por isso que têm nome: um
 * `/signup` digitado à mão numa tela e trocado só na outra deixa um link morto
 * que nada acusa em tempo de compilação.
 *
 * `ROTA_INICIAL` é para onde vai quem acabou de entrar — o Chat é o coração do
 * sistema.
 */
export const ROTA_INICIAL = '/chat'
export const ROTA_DE_LOGIN = '/login'
export const ROTA_DE_CADASTRO = '/signup'

/**
 * A espera enquanto o app descobre se há alguém logado.
 *
 * É meio segundo, mas não dá para pular: sem ela, a primeira pintura aconteceria
 * com `session = null` e o usuário logado veria um lampejo da tela de login
 * antes de o app se corrigir — parece um bug, e num app financeiro parece um
 * bug preocupante.
 */
function Carregando() {
  return (
    <div className="flex h-viewport items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
    </div>
  )
}

/**
 * A guarda de rota: **deslogado não acessa nada**.
 *
 * Envolve todas as rotas internas no `App.tsx`. Sem sessão, redireciona para o
 * login guardando de onde a pessoa veio (`state.de`), para que o login a devolva
 * ao lugar certo — quem clicou num link de `/expenses` e foi parar no login não
 * quer aterrissar no Chat depois de entrar.
 *
 * `replace` mantém o histórico limpo: sem ele, o botão de voltar traria a pessoa
 * de volta à rota bloqueada, que a mandaria ao login de novo — um laço.
 */
export function RotaProtegida() {
  const { session, carregando } = useAuth()
  const localizacao = useLocation()

  if (carregando) return <Carregando />
  if (!session) {
    return <Navigate to={ROTA_DE_LOGIN} replace state={{ de: localizacao.pathname }} />
  }
  return <Outlet />
}

/**
 * De onde a pessoa veio antes de ser mandada ao login — ou a rota inicial.
 *
 * A validação não é paranoia à toa: hoje o valor só é escrito pela `RotaProtegida`
 * a partir de um `pathname` interno, mas `state` é do histórico do navegador e
 * pode ser forjado. Um caminho começando com `//` seria lido como
 * protocolo-relativo (`//site-do-atacante`) e o `Navigate` mandaria o usuário
 * para fora do app logo depois de ele digitar a senha.
 */
function destinoAposLogin(de: unknown): string {
  if (typeof de !== 'string') return ROTA_INICIAL
  if (!de.startsWith('/') || de.startsWith('//')) return ROTA_INICIAL
  if (de === ROTA_DE_LOGIN || de === ROTA_DE_CADASTRO) return ROTA_INICIAL
  return de
}

/**
 * O contrário: quem JÁ está logado não vê login nem cadastro.
 *
 * Sem isto, voltar para `/login` depois de entrar mostraria um formulário de
 * login para alguém que já está dentro — e um novo `signIn` ali criaria uma
 * segunda sessão sem necessidade.
 *
 * É também quem faz o redirecionamento DEPOIS de entrar: as telas de login e
 * cadastro não navegam por conta própria. Elas só criam a sessão; a mudança de
 * sessão re-renderiza esta guarda, e é ela que decide o destino. Assim existe um
 * lugar só decidindo para onde se vai — se cada tela navegasse sozinha, as duas
 * correriam com esta guarda e o destino dependeria de quem chegasse primeiro.
 */
export function RotaPublica() {
  const { session, carregando } = useAuth()
  const localizacao = useLocation()

  if (carregando) return <Carregando />
  if (session) {
    return <Navigate to={destinoAposLogin(localizacao.state?.de)} replace />
  }
  return <Outlet />
}

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { useAuth } from '@/shared/context/AuthContext'

export const ROTA_INICIAL = '/chat'
export const ROTA_DE_LOGIN = '/login'
export const ROTA_DE_CADASTRO = '/signup'

function Carregando() {
  return (
    <div className="flex h-viewport items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
    </div>
  )
}

export function RotaProtegida() {
  const { session, carregando } = useAuth()
  const localizacao = useLocation()

  if (carregando) return <Carregando />
  if (!session) {
    return <Navigate to={ROTA_DE_LOGIN} replace state={{ de: localizacao.pathname }} />
  }
  return <Outlet />
}

function destinoAposLogin(de: unknown): string {
  if (typeof de !== 'string') return ROTA_INICIAL
  if (!de.startsWith('/') || de.startsWith('//')) return ROTA_INICIAL
  if (de === ROTA_DE_LOGIN || de === ROTA_DE_CADASTRO) return ROTA_INICIAL
  return de
}

export function RotaPublica() {
  const { session, carregando } = useAuth()
  const localizacao = useLocation()

  if (carregando) return <Carregando />
  if (session) {
    return <Navigate to={destinoAposLogin(localizacao.state?.de)} replace />
  }
  return <Outlet />
}

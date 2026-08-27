import { Loader2 } from 'lucide-react'

import { useAuth } from '@/shared/context/AuthContext'
import { ProfileCard } from './components/ProfileCard'
import { SecurityCard } from './components/SecurityCard'

export function AccountPage() {
  const { perfil, session } = useAuth()

  if (!perfil) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard perfil={perfil} />
        <SecurityCard email={session?.user.email ?? perfil.email} />
      </div>
    </>
  )
}

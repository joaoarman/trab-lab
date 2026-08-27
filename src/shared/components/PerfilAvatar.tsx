import { UserRound } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { cn } from '@/shared/lib/utils'

export function PerfilAvatar({
  url,
  nome,
  className,
  classNameFallback,
  tamanhoDoIcone = 'size-4',
}: {
  url: string | null
  nome: string
  className?: string
  classNameFallback?: string
  tamanhoDoIcone?: string
}) {
  const iniciais = iniciaisDe(nome)

  return (
    <Avatar className={className}>
      {url && <AvatarImage src={url} alt="" />}
      <AvatarFallback
        className={cn(
          'bg-primary-muted font-medium text-primary-muted-foreground',
          classNameFallback,
        )}
      >
        {iniciais || <UserRound className={tamanhoDoIcone} aria-hidden />}
      </AvatarFallback>
    </Avatar>
  )
}

function iniciaisDe(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase()
}

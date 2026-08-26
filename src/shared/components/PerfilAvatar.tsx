import { UserRound } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { cn } from '@/shared/lib/utils'

/**
 * A foto do usuário, com o mesmo recuo quando ela não existe.
 *
 * ## Por que é compartilhado
 *
 * O avatar aparece em dois lugares que não se conhecem: o **menu do usuário**
 * (rodapé da sidebar no desktop, header no celular) e o **campo de foto** da tela
 * de conta. Os dois precisam do mesmo recuo — as iniciais do nome, e o ícone
 * genérico quando nem nome há — e mantê-lo em duplicata deixaria a pessoa se ver
 * com iniciais numa tela e um boneco na outra, dependendo de qual das duas cópias
 * alguém tivesse ajustado por último.
 *
 * O componente **não sabe de onde vem a URL**: recebe-a pronta. É o que permite o
 * campo da tela de conta passar a prévia local de uma foto recortada e ainda não
 * salva, enquanto o menu passa a URL pública do que já está no bucket.
 */
export function PerfilAvatar({
  url,
  nome,
  className,
  classNameFallback,
  tamanhoDoIcone = 'size-4',
}: {
  /** A foto a exibir, ou null para cair nas iniciais. */
  url: string | null
  /** De onde saem as iniciais. Vazio cai no ícone genérico. */
  nome: string
  className?: string
  classNameFallback?: string
  /** O ícone genérico acompanha o tamanho do avatar, que varia entre os usos. */
  tamanhoDoIcone?: string
}) {
  const iniciais = iniciaisDe(nome)

  return (
    <Avatar className={className}>
      {/* `alt` vazio de propósito: o nome já está escrito ao lado em todos os
          usos, e repeti-lo faria o leitor de tela dizer a mesma coisa duas vezes. */}
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

/**
 * As iniciais de um nome — no máximo duas letras.
 *
 * Duas e não mais: três ou quatro letras não cabem num círculo de 32px sem
 * encolher a fonte a ponto de não se ler, e "João da Silva Pereira" viraria
 * "JDSP". As duas primeiras palavras são as que identificam.
 */
function iniciaisDe(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase()
}

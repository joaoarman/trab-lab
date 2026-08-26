import { Loader2 } from 'lucide-react'

import { useAuth } from '@/shared/context/AuthContext'
import { ProfileCard } from './components/ProfileCard'
import { SecurityCard } from './components/SecurityCard'

/**
 * Minha conta — `/account`.
 *
 * Dois cards, e a divisão entre eles é a da própria página: **Perfil** são os
 * dados (foto e nome, num "Salvar" só) e **Segurança** são as chaves de entrada
 * (e-mail e senha, cada uma com o próprio fluxo). O porquê da separação está no
 * `SecurityCard`.
 *
 * Não há "excluir conta" — não entrou no escopo. Ver o `PENDENCIAS.md` na raiz.
 */
export function AccountPage() {
  const { perfil, session } = useAuth()

  // O perfil chega logo depois da sessão, mas não junto com ela. Sem esta
  // espera, a tela montaria com `perfil = null` e piscaria um card vazio.
  if (!perfil) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  return (
    <>
      {/* Sem título aqui: quem escreve "Minha conta" no topo é o header, a partir
          de `ROTAS_AUXILIARES` (navigation.ts) — o mesmo lugar de onde saem os
          títulos dos módulos. Repeti-lo na página daria dois <h1> na mesma tela. */}
      {/* Uma coluna no celular, duas no desktop. As duas telas têm o mesmo peso
          neste projeto: aqui é onde o mês é revisado, e no monitor os dois cards
          lado a lado evitam rolagem para trocar a senha. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard perfil={perfil} />
        {/* O e-mail vem da SESSÃO, não do perfil: `auth.users` é a fonte da
            verdade e `profile.email` é só uma cópia mantida por trigger. Se as
            duas divergirem por um instante, o que a tela mostra é o que vale
            para entrar no sistema. */}
        <SecurityCard email={session?.user.email ?? perfil.email} />
      </div>
    </>
  )
}

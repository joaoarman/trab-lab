import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronsUpDown, Languages, LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react'
import { PerfilAvatar } from '@/shared/components/PerfilAvatar'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { useTheme, type Theme } from '@/shared/context/ThemeContext'
import { useAuth } from '@/shared/context/AuthContext'
import { urlDoAvatar } from '@/shared/lib/avatar'
import i18n, { LANGUAGES, setLanguage, type LanguageCode } from '@/shared/i18n'
import { ROTA_DA_CONTA } from './navigation'

/**
 * O menu do usuário — e, junto com ele, o **tema** e o **idioma**.
 *
 * Os dois controles moram aqui, e não soltos no header, porque são preferências
 * de conta: escolhem-se uma vez e não se voltam. Um botão permanente no header
 * gastaria, em toda tela, espaço que no celular é do título — e o Chat, que é a
 * tela principal, é justamente a que menos quer enfeite em volta.
 *
 * ## De onde vêm nome, e-mail e foto
 *
 * Do `AuthContext` — o mesmo provider que a guarda de rota consulta. O e-mail sai
 * da **sessão**, não do perfil: `auth.users` é a fonte da verdade e
 * `profile.email` é uma cópia mantida por trigger. Se as duas divergirem por um
 * instante, o que o menu mostra é o endereço que vale para entrar no sistema.
 *
 * O menu nunca aparece deslogado: ele vive dentro do shell, e o shell inteiro
 * está atrás da guarda de rota. Por isso não há estado "sem usuário" aqui.
 */
const ICONES_DE_TEMA: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

export function UserMenu({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { perfil, session, sairDaConta } = useAuth()
  const navigate = useNavigate()
  const idiomaAtual = i18n.language as LanguageCode

  // O perfil chega um instante depois da sessão. Nesse intervalo o menu mostra o
  // e-mail (que já veio no token) em vez de um espaço vazio piscando.
  const email = session?.user.email ?? ''
  const nome = perfil?.nome?.trim() || t('account.menu.noName')
  const fotoUrl = perfil ? urlDoAvatar(perfil) : null
  const IconeDoTema = ICONES_DE_TEMA[theme]

  // As iniciais saem do nome do PERFIL, não do rótulo exibido: `nome` cai num
  // texto traduzido ("Sem nome") quando o perfil ainda não chegou, e virar "SN"
  // no círculo pareceria o nome de alguém.
  const avatar = (
    <PerfilAvatar
      url={fotoUrl}
      nome={perfil?.nome ?? ''}
      className="size-8"
      classNameFallback="text-sm"
    />
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'full' ? (
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left outline-none ring-ring transition-colors hover:bg-accent focus-visible:ring-2"
          >
            {avatar}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{nome}</span>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        ) : (
          <Button variant="ghost" size="icon" aria-label={t('account.menu.label')}>
            {avatar}
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="min-w-0">
          <span className="block truncate">{nome}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Tema — submenu de três estados. "Sistema" não é enfeite: é a única
            opção que faz o app virar sozinho junto com o aparelho à noite. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconeDoTema className="size-4" aria-hidden />
            {t('theme.label')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(valor) => setTheme(valor as Theme)}
            >
              <DropdownMenuRadioItem value="light">
                <Sun className="size-4" aria-hidden />
                {t('theme.light')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="size-4" aria-hidden />
                {t('theme.dark')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="size-4" aria-hidden />
                {t('theme.system')}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Idioma — a lista sai de LANGUAGES (src/shared/i18n), então acrescentar
            um idioma lá já o faz aparecer aqui. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages className="size-4" aria-hidden />
            {t('language.label')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {LANGUAGES.map((idioma) => (
              <DropdownMenuItem
                key={idioma.code}
                onSelect={() => setLanguage(idioma.code)}
                className="justify-between"
              >
                {t(idioma.labelKey)}
                {idioma.code === idiomaAtual && <Check className="size-4" aria-hidden />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => navigate(ROTA_DA_CONTA)}>
          <UserRound className="size-4" aria-hidden />
          {t('account.menu.myAccount')}
        </DropdownMenuItem>
        {/* Sair não navega: encerrar a sessão faz a guarda de rota trocar a tela
            sozinha. Navegar aqui também correria com ela pelo mesmo destino. */}
        <DropdownMenuItem onSelect={() => void sairDaConta()}>
          <LogOut className="size-4" aria-hidden />
          {t('account.menu.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

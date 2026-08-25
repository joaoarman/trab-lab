import { useTranslation } from 'react-i18next'
import { Check, ChevronsUpDown, Languages, LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar'
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
import i18n, { LANGUAGES, setLanguage, type LanguageCode } from '@/shared/i18n'

/**
 * O menu do usuário — e, junto com ele, o **tema** e o **idioma**.
 *
 * Os dois controles moram aqui, e não soltos no header, porque são preferências
 * de conta: escolhem-se uma vez e não se voltam. Um botão permanente no header
 * gastaria, em toda tela, espaço que no celular é do título — e o Chat, que é a
 * tela principal, é justamente a que menos quer enfeite em volta.
 *
 * ## Autenticação ainda não existe
 *
 * O login (perfil, sessão, sair) é um módulo à parte, ainda por implementar. Até
 * lá o menu mostra o estado deslogado e os itens de conta ficam **desabilitados**
 * — desabilitado é honesto: o item existe, o lugar dele é este, mas ainda não
 * leva a lugar nenhum. Esconder faria a navegação mudar de forma no dia em que o
 * login entrasse.
 *
 * Quando o auth entrar: troque `nome`/`email` pelo perfil do contexto de
 * autenticação, e ligue os `onSelect` de "Minha conta" e "Sair".
 */
const ICONES_DE_TEMA: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

export function UserMenu({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const idiomaAtual = i18n.language as LanguageCode

  // Sem auth ainda: o rótulo diz o estado em vez de inventar um usuário.
  const nome = t('account.menu.noName')
  const email = t('account.menu.notSignedIn')
  const IconeDoTema = ICONES_DE_TEMA[theme]

  const avatar = (
    <Avatar className="size-8">
      <AvatarFallback className="bg-primary-muted text-sm font-medium text-primary-muted-foreground">
        <UserRound className="size-4" aria-hidden />
      </AvatarFallback>
    </Avatar>
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

        {/* Ainda sem autenticação — ver a nota no topo do arquivo. */}
        <DropdownMenuItem disabled>
          <UserRound className="size-4" aria-hidden />
          {t('account.menu.myAccount')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <LogOut className="size-4" aria-hidden />
          {t('account.menu.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

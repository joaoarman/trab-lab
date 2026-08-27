import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Languages, Monitor, Moon, Sun } from 'lucide-react'

import { Brand } from '@/shared/components/layout/Brand'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { useTheme, type Theme } from '@/shared/context/ThemeContext'
import i18n, { LANGUAGES, setLanguage, type LanguageCode } from '@/shared/i18n'

const ICONES_DE_TEMA: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor }

export function AuthShell({
  titulo,
  descricao,
  children,
  rodape,
}: {
  titulo: string
  descricao: string
  children: ReactNode
  rodape?: ReactNode
}) {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const IconeDoTema = ICONES_DE_TEMA[theme]
  const idiomaAtual = i18n.language as LanguageCode

  return (
    <div className="flex min-h-viewport flex-col bg-background">
      <div className="flex justify-end gap-1 p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('theme.label')}>
              <IconeDoTema className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
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
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('language.label')}>
              <Languages className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {LANGUAGES.map((idioma) => (
              <DropdownMenuItem
                key={idioma.code}
                onSelect={() => setLanguage(idioma.code)}
                className="justify-between gap-6"
              >
                {t(idioma.labelKey)}
                {idioma.code === idiomaAtual && <Check className="size-4" aria-hidden />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-1 items-center justify-center px-content pb-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Brand />
          </div>

          <div className="mb-6 space-y-1 text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{titulo}</h1>
            <p className="text-sm text-muted-foreground">{descricao}</p>
          </div>

          {children}

          {rodape && <div className="mt-6 text-center text-sm text-muted-foreground">{rodape}</div>}
        </div>
      </div>
    </div>
  )
}

export function ErroDoFormulario({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {mensagem}
    </p>
  )
}

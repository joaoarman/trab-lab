import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'

const SUGESTOES = [
  'chat.welcome.examples.expense',
  'chat.welcome.examples.dollar',
  'chat.welcome.examples.income',
  'chat.welcome.examples.query',
  'chat.welcome.examples.summary',
] as const

export function BoasVindasDoChat({ onEscolher }: { onEscolher: (frase: string) => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-2 py-8 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-primary-muted text-primary-muted-foreground">
        <Sparkles className="size-7" aria-hidden />
      </span>

      <div className="max-w-prose space-y-2">
        <h2 className="font-display text-xl font-semibold">{t('chat.welcome.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('chat.welcome.description')}</p>
      </div>

      <div className="flex w-full max-w-xl flex-col gap-2">
        {SUGESTOES.map((chave) => (
          <Button
            key={chave}
            type="button"
            variant="outline"
            className="h-auto min-h-11 justify-start whitespace-normal px-4 py-3 text-left text-sm font-normal"
            onClick={() => onEscolher(t(chave))}
          >
            {t(chave)}
          </Button>
        ))}
      </div>
    </div>
  )
}

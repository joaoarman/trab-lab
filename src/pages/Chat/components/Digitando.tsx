import { useTranslation } from 'react-i18next'

export function Digitando() {
  const { t } = useTranslation()

  return (
    <div className="flex w-full justify-start pl-8" role="status" aria-live="polite">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-3.5 shadow-sm">
        <span className="sr-only">{t('chat.typing')}</span>
        {['0ms', '150ms', '300ms'].map((atraso) => (
          <span
            key={atraso}
            aria-hidden
            className="size-2 animate-typing-dot rounded-full bg-muted-foreground"
            style={{ animationDelay: atraso }}
          />
        ))}
      </div>
    </div>
  )
}

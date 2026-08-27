import { useTranslation } from 'react-i18next'
import { Loader2, LogOut, MonitorSmartphone, X } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'

export type EscopoDeSaida = 'global' | 'others' | 'nenhuma'

export function EscolhaDeSessoes({
  titulo,
  onEscolher,
  processando,
}: {
  titulo: string
  onEscolher: (escopo: EscopoDeSaida) => void
  processando: boolean
}) {
  const { t } = useTranslation()

  return (
    <>
      <DialogHeader>
        <DialogTitle>{titulo}</DialogTitle>
        <DialogDescription>{t('account.sessions.description')}</DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Button
          variant="outline"
          className="h-auto w-full justify-start gap-3 whitespace-normal py-3 text-left"
          disabled={processando}
          onClick={() => onEscolher('nenhuma')}
        >
          <X className="shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block font-medium">{t('account.sessions.keepAll')}</span>
            <span className="block text-xs font-normal text-muted-foreground">
              {t('account.sessions.keepAllHint')}
            </span>
          </span>
        </Button>

        <Button
          variant="outline"
          className="h-auto w-full justify-start gap-3 whitespace-normal py-3 text-left"
          disabled={processando}
          onClick={() => onEscolher('others')}
        >
          <MonitorSmartphone className="shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block font-medium">{t('account.sessions.signOutOthers')}</span>
            <span className="block text-xs font-normal text-muted-foreground">
              {t('account.sessions.signOutOthersHint')}
            </span>
          </span>
        </Button>

        <Button
          variant="outline"
          className="h-auto w-full justify-start gap-3 whitespace-normal py-3 text-left"
          disabled={processando}
          onClick={() => onEscolher('global')}
        >
          <LogOut className="shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block font-medium">{t('account.sessions.signOutAll')}</span>
            <span className="block text-xs font-normal text-muted-foreground">
              {t('account.sessions.signOutAllHint')}
            </span>
          </span>
        </Button>
      </div>

      {processando && (
        <DialogFooter>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('common.processing')}
          </span>
        </DialogFooter>
      )}
    </>
  )
}

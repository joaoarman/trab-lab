import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import type { Gasto } from '@/shared/data/model'
import { formatDate, formatMoney } from '@/shared/i18n/format'
import { chaveDeErroDeGasto, removerGasto } from '../supabase'

export function DialogoDeRemocaoDeGasto({
  gasto,
  onFechar,
  onRemovido,
}: {
  gasto: Gasto | null
  onFechar: () => void
  onRemovido: () => void
}) {
  const { t } = useTranslation()

  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)

  async function aoConfirmar() {
    if (!gasto) return

    setErro(null)
    setProcessando(true)
    try {
      await removerGasto(gasto.id)
      toast.success(t('expenses.remove.done'))
      onRemovido()
    } catch (falha) {
      setErro(t(chaveDeErroDeGasto(falha)))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <Dialog open={gasto !== null} onOpenChange={(aberta) => !aberta && !processando && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('expenses.remove.title', { name: gasto?.nome ?? '' })}
          </DialogTitle>
          {gasto && (
            <DialogDescription>
              {t('expenses.remove.description', {
                value: formatMoney(gasto.valorEmBrl),
                date: formatDate(gasto.ocorreuEm, {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </DialogDescription>
          )}
        </DialogHeader>

        {erro && <Alert variant="destructive">{erro}</Alert>}

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={processando}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={aoConfirmar} disabled={processando}>
            {processando && <Loader2 className="animate-spin" aria-hidden />}
            {t('expenses.remove.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

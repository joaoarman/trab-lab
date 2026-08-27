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
import type { Receita } from '@/shared/data/model'
import { formatDate, formatMoney } from '@/shared/i18n/format'
import { chaveDeErroDeReceita, removerReceita } from '../supabase'

export function DialogoDeRemocaoDeReceita({
  receita,
  onFechar,
  onRemovida,
}: {
  receita: Receita | null
  onFechar: () => void
  onRemovida: () => void
}) {
  const { t } = useTranslation()

  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)

  async function aoConfirmar() {
    if (!receita) return

    setErro(null)
    setProcessando(true)
    try {
      await removerReceita(receita.id)
      toast.success(t('income.remove.done'))
      onRemovida()
    } catch (falha) {
      setErro(t(chaveDeErroDeReceita(falha)))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <Dialog open={receita !== null} onOpenChange={(aberta) => !aberta && !processando && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('income.remove.title', { name: receita?.nome ?? '' })}
          </DialogTitle>
          {receita && (
            <DialogDescription>
              {t('income.remove.description', {
                value: formatMoney(receita.valorEmBrl),
                date: formatDate(receita.recebidaEm, {
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
            {t('income.remove.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

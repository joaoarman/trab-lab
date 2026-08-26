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

/**
 * A confirmação de exclusão de um gasto.
 *
 * ## Por que ela é tão mais simples que a das categorias
 *
 * Excluir uma categoria tem dois desfechos possíveis (excluir ou desativar), e
 * qual deles vale depende do que está pendurado nela — por isso aquela modal
 * consulta o banco antes de perguntar. Aqui não há nada pendurado num gasto:
 * excluir sempre exclui, e uma consulta prévia não teria o que descobrir.
 *
 * ## Mas ela repete o que vai sumir
 *
 * O valor e a data aparecem no texto de propósito. A lista pode ter dez linhas
 * parecidas ("Mercado", "Mercado", "Mercado"), e num celular a modal cobre
 * justamente a linha que estava sendo apontada. Repetir os dois dados é o que
 * transforma "tem certeza?" numa pergunta que dá para responder.
 *
 * É soft-delete no banco (`deleted_at`), mas o texto diz "vai sumir da lista" —
 * porque é isso que acontece para quem usa. Prometer que dá para desfazer seria
 * mentira: não existe tela que traga o gasto de volta.
 */
export function DialogoDeRemocaoDeGasto({
  gasto,
  onFechar,
  onRemovido,
}: {
  /** `null` = fechada. */
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

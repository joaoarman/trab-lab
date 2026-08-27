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
import { limparConversa } from '../supabase'

/**
 * A confirmação de "limpar conversa".
 *
 * ## Ela existe para desfazer um mal-entendido, não para dificultar o clique
 *
 * A pergunta que o usuário faz diante desse botão não é "tem certeza?", é **"isso
 * apaga meus gastos?"**. A conversa é o caminho por onde ele registrou tudo, então
 * é natural achar que limpar a conversa desfaz o que ela criou.
 *
 * Não desfaz: `ai_log` e as tabelas de gasto, receita e categoria não se
 * referenciam. A descrição diz isso com todas as letras, porque é a única
 * informação que muda a decisão — e sem ela o botão simplesmente não seria usado.
 *
 * ## E ela não é destrutiva de verdade
 *
 * No banco é `is_active = false`, nunca `delete`: as mensagens continuam lá, com o
 * custo já contabilizado, e a tela do **Log da IA continua mostrando todas**. O
 * texto não promete um "desfazer" (não há tela que traga a conversa de volta), mas
 * também não usa a variante `destructive` no botão — porque o que se perde é a
 * conversa na tela, e nada mais.
 */
export function DialogoDeLimpeza({
  aberto,
  onFechar,
  onLimpo,
}: {
  aberto: boolean
  onFechar: () => void
  onLimpo: () => void
}) {
  const { t } = useTranslation()

  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)

  async function aoConfirmar() {
    setErro(null)
    setProcessando(true)
    try {
      await limparConversa()
      toast.success(t('chat.clear.done'))
      onLimpo()
    } catch {
      setErro(t('chat.errors.unknown'))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(estaAberto) => !estaAberto && !processando && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{t('chat.clear.title')}</DialogTitle>
          <DialogDescription>{t('chat.clear.description')}</DialogDescription>
        </DialogHeader>

        {erro && <Alert variant="destructive">{erro}</Alert>}

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={processando}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void aoConfirmar()} disabled={processando}>
            {processando && <Loader2 className="animate-spin" aria-hidden />}
            {t('chat.clear.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog'

export function DetalheDoPrompt({
  rotulo,
  titulo,
  descricao,
  conteudo,
}: {
  rotulo: string
  titulo: string
  descricao: string
  conteudo: string
}) {
  const { t } = useTranslation()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-sm underline decoration-primary decoration-dotted decoration-2 underline-offset-2 outline-none ring-ring transition-colors hover:text-primary focus-visible:ring-2"
          title={t('slides.fluxoTecnico.verDetalhe')}
        >
          {rotulo}
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] max-w-3xl grid-rows-[auto_1fr]">
        <DialogHeader>
          <DialogTitle className="font-display">{titulo}</DialogTitle>
          <DialogDescription className="text-pretty">{descricao}</DialogDescription>
        </DialogHeader>
        <pre className="min-h-0 overflow-auto rounded-md border border-border bg-muted/50 p-4 font-mono text-[0.6875rem] leading-relaxed">
          <code>{conteudo}</code>
        </pre>
      </DialogContent>
    </Dialog>
  )
}

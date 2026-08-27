import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Cropper, { type Area } from 'react-easy-crop'
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { cropToSquareJpeg } from '@/shared/utils/image'

export function CropDialog({
  imagem,
  aberto,
  onCancelar,
  onConfirmar,
}: {
  imagem: string | null
  aberto: boolean
  onCancelar: () => void
  onConfirmar: (recortada: Blob) => void
}) {
  const { t } = useTranslation()
  const [posicao, setPosicao] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [processando, setProcessando] = useState(false)

  async function confirmar() {
    if (!imagem || !area) return
    setProcessando(true)
    try {
      onConfirmar(await cropToSquareJpeg(imagem, area))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(estaAberto) => {
        if (!estaAberto) onCancelar()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('account.avatar.cropTitle')}</DialogTitle>
          <DialogDescription>{t('account.avatar.cropDescription')}</DialogDescription>
        </DialogHeader>

        <div className="relative h-64 w-full overflow-hidden rounded-md bg-muted">
          {imagem && (
            <Cropper
              image={imagem}
              crop={posicao}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setPosicao}
              onZoomChange={setZoom}
              onCropComplete={(_area, emPixels) => setArea(emPixels)}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <ZoomOut className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label={t('account.avatar.zoom')}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={processando}>
            {t('common.cancel')}
          </Button>
          <Button onClick={confirmar} disabled={!area || processando}>
            {processando && <Loader2 className="animate-spin" aria-hidden />}
            {t('account.avatar.cropConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

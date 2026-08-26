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

/**
 * O recorte da foto de perfil.
 *
 * ## Por que recortar é obrigatório, e não "opcional"
 *
 * O avatar é sempre desenhado num círculo. Uma foto na horizontal, jogada
 * direto nele, é cortada pelo navegador **pelo centro geométrico** — que quase
 * nunca é onde está o rosto. Deixar a pessoa escolher o enquadramento é a
 * diferença entre uma foto de perfil e um pedaço de ombro.
 *
 * O recorte também padroniza o arquivo: sai sempre um JPEG quadrado de 512px,
 * de dezenas de KB, e não os vários megabytes que a câmera de um celular produz
 * — que, aliás, o bucket recusaria (o limite é 2 MB).
 *
 * ## O que este componente NÃO faz
 *
 * Não sobe nada. Devolve o Blob recortado e quem o guarda é a tela de perfil,
 * como uma alteração pendente, até o "Salvar". Ver `AvatarField`.
 */
export function CropDialog({
  imagem,
  aberto,
  onCancelar,
  onConfirmar,
}: {
  /** A imagem escolhida, como object URL. Null quando não há nada para recortar. */
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

        {/* O Cropper se mede pelo elemento posicionado que o contém, então esta
            altura fixa não é enfeite: sem ela a área de recorte teria zero de
            altura e a imagem não apareceria. */}
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

        {/* Um <input range> nativo: no celular o zoom sai da pinça, mas no
            desktop nem todo mouse tem roda — sem a barra, quem usa trackpad
            ficaria sem como aproximar. */}
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

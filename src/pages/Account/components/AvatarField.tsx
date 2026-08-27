import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Trash2 } from 'lucide-react'

import { PerfilAvatar } from '@/shared/components/PerfilAvatar'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { CropDialog } from './CropDialog'
import type { AcaoDeAvatar } from '../supabase'

const MIMES_ACEITOS = 'image/jpeg,image/png,image/webp'

const TAMANHO_MAXIMO_DA_ORIGEM = 15 * 1024 * 1024

export function AvatarField({
  urlAtual,
  nome,
  acao,
  onAcao,
  desabilitado,
}: {
  urlAtual: string | null
  nome: string
  acao: AcaoDeAvatar
  onAcao: (acao: AcaoDeAvatar) => void
  desabilitado: boolean
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [imagemParaRecortar, setImagemParaRecortar] = useState<string | null>(null)
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [previa, setPrevia] = useState<string | null>(null)
  useEffect(() => {
    if (acao.tipo !== 'trocar') {
      setPrevia(null)
      return
    }
    const url = URL.createObjectURL(acao.arquivo)
    setPrevia(url)
    return () => URL.revokeObjectURL(url)
  }, [acao])

  useEffect(() => {
    if (!imagemParaRecortar) return
    return () => URL.revokeObjectURL(imagemParaRecortar)
  }, [imagemParaRecortar])

  const urlExibida = acao.tipo === 'trocar' ? previa : acao.tipo === 'remover' ? null : urlAtual
  const temFoto = urlExibida !== null

  function escolherArquivo(arquivo: File | undefined) {
    if (inputRef.current) inputRef.current.value = ''
    if (!arquivo) return

    setErro(null)
    if (!MIMES_ACEITOS.split(',').includes(arquivo.type)) {
      setErro(t('account.avatar.errorType'))
      return
    }
    if (arquivo.size > TAMANHO_MAXIMO_DA_ORIGEM) {
      setErro(t('account.avatar.errorSize'))
      return
    }
    setImagemParaRecortar(URL.createObjectURL(arquivo))
  }

  return (
    <div className="flex items-center gap-4">
      <PerfilAvatar
        url={urlExibida}
        nome={nome}
        className="size-20 shrink-0"
        classNameFallback="text-lg"
        tamanhoDoIcone="size-7"
      />

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={desabilitado}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus aria-hidden />
            {temFoto ? t('account.avatar.change') : t('account.avatar.add')}
          </Button>

          {temFoto && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={desabilitado}
              onClick={() => setConfirmandoRemocao(true)}
            >
              <Trash2 aria-hidden />
              {t('account.avatar.remove')}
            </Button>
          )}
        </div>

        {erro ? (
          <p className="text-xs text-destructive">{erro}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('account.avatar.hint')}</p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={MIMES_ACEITOS}
        className="hidden"
        onChange={(e) => escolherArquivo(e.target.files?.[0])}
      />

      <CropDialog
        imagem={imagemParaRecortar}
        aberto={imagemParaRecortar !== null}
        onCancelar={() => setImagemParaRecortar(null)}
        onConfirmar={(recortada) => {
          onAcao({ tipo: 'trocar', arquivo: recortada })
          setImagemParaRecortar(null)
        }}
      />

      <Dialog open={confirmandoRemocao} onOpenChange={setConfirmandoRemocao}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('account.avatar.removeTitle')}</DialogTitle>
            <DialogDescription>{t('account.avatar.removeDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmandoRemocao(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onAcao({ tipo: 'remover' })
                setConfirmandoRemocao(false)
              }}
            >
              {t('account.avatar.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Pause, SendHorizonal, Square, Trash2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { OndaDeVoz } from './OndaDeVoz'
import { MAX_SEGUNDOS, useGravador } from './useGravador'

export function Compositor({
  onEnviarTexto,
  onEnviarAudio,
  onErroDeGravacao,
  ocupado,
}: {
  onEnviarTexto: (texto: string) => void
  onEnviarAudio: (audio: Blob) => void
  onErroDeGravacao: (erro: 'permission_denied' | 'unsupported') => void
  ocupado: boolean
}) {
  const { t } = useTranslation()
  const [texto, setTexto] = useState('')
  const campo = useRef<HTMLTextAreaElement>(null)
  const { estado, segundos, niveis, previa, erro, iniciar, pausar, retomar, parar, cancelar } =
    useGravador()

  const gravando = estado === 'gravando'
  const pausado = estado === 'pausado'
  const emGravacao = gravando || pausado
  const podeEnviarTexto = texto.trim().length > 0 && !ocupado

  useEffect(() => {
    const elemento = campo.current
    if (!elemento) return

    elemento.style.height = 'auto'
    const alturaDoConteudo = elemento.scrollHeight
    elemento.style.height = `${Math.min(alturaDoConteudo, ALTURA_MAXIMA)}px`
    elemento.style.overflowY = alturaDoConteudo > ALTURA_MAXIMA ? 'auto' : 'hidden'
  }, [texto])

  useEffect(() => {
    if (erro) onErroDeGravacao(erro)
  }, [erro, onErroDeGravacao])

  async function encerrarEEnviar() {
    const audio = await parar()
    if (audio && audio.size > 0) onEnviarAudio(audio)
  }

  useEffect(() => {
    if (gravando && segundos >= MAX_SEGUNDOS) void encerrarEEnviar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravando, segundos])

  function enviarTexto() {
    if (!podeEnviarTexto) return
    onEnviarTexto(texto.trim())
    setTexto('')
  }

  const minutos = String(Math.floor(segundos / 60)).padStart(2, '0')
  const restoDosSegundos = String(segundos % 60).padStart(2, '0')

  return (
    <div className="shrink-0 border-t border-border bg-background px-3 py-3">
      {emGravacao ? (
        <div className="mx-auto flex w-full max-w-content items-center gap-2 sm:gap-3">
          <span className="shrink-0 font-mono text-sm tabular-nums text-foreground" aria-live="polite">
            {minutos}:{restoDosSegundos}
          </span>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {pausado && previa ? (
              <audio src={previa} controls className="h-9 w-full" aria-label={t('chat.composer.playback')} />
            ) : (
              <OndaDeVoz niveis={niveis} />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground hover:text-destructive"
              onClick={cancelar}
              aria-label={t('chat.composer.cancelRecording')}
            >
              <Trash2 className="size-5" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground hover:text-foreground"
              onClick={pausado ? retomar : pausar}
              aria-label={
                pausado ? t('chat.composer.resumeRecording') : t('chat.composer.pauseRecording')
              }
            >
              {pausado ? <Square className="size-4 fill-current" /> : <Pause className="size-5" />}
            </Button>

            <Button
              type="button"
              size="icon"
              className="size-11 rounded-full"
              onClick={() => void encerrarEEnviar()}
              aria-label={t('chat.composer.sendRecording')}
            >
              <SendHorizonal className="size-5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-content items-end gap-2">
          <Textarea
            ref={campo}
            rows={1}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' && !evento.shiftKey) {
                evento.preventDefault()
                enviarTexto()
              }
            }}
            enterKeyHint="send"
            placeholder={t('chat.composer.placeholder')}
            aria-label={t('chat.composer.label')}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl py-3"
          />

          {texto.trim().length > 0 ? (
            <Button
              type="button"
              size="icon"
              className="size-11 shrink-0 rounded-full"
              disabled={!podeEnviarTexto}
              onClick={enviarTexto}
              aria-label={t('chat.composer.send')}
            >
              <SendHorizonal className="size-5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-11 shrink-0 rounded-full"
              disabled={ocupado}
              onClick={() => void iniciar()}
              aria-label={t('chat.composer.record')}
            >
              <Mic className="size-5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

const ALTURA_MAXIMA = 160

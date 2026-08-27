import { useTranslation } from 'react-i18next'
import { AudioLines, Ban, Mic, Sparkles } from 'lucide-react'

import { PerfilAvatar } from '@/shared/components/PerfilAvatar'
import { useAuth } from '@/shared/context/AuthContext'
import { cn } from '@/shared/lib/utils'
import type { MensagemDaIA } from '@/shared/data/model'
import { urlDoAvatar } from '@/shared/lib/avatar'
import { CartaoDeRegistro } from './CartaoDeRegistro'
import { TextoDaIA } from './TextoDaIA'

export function Bolha({
  mensagem,
  transcrevendo = false,
}: {
  mensagem: MensagemDaIA
  transcrevendo?: boolean
}) {
  const { t, i18n } = useTranslation()
  const { perfil } = useAuth()

  const doUsuario = mensagem.papel === 'USER'
  const recusa = mensagem.tipo === 'REFUSAL'

  const horario = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(mensagem.criadaEm))

  const avatar = doUsuario ? (
    <PerfilAvatar
      url={perfil ? urlDoAvatar(perfil) : null}
      nome={perfil?.nome ?? ''}
      className="size-6"
      classNameFallback="text-[0.625rem]"
      tamanhoDoIcone="size-3"
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full',
        recusa
          ? 'bg-destructive-muted text-destructive'
          : 'bg-primary-muted text-primary-muted-foreground',
      )}
    >
      {recusa ? <Ban className="size-3.5" /> : <Sparkles className="size-3.5" />}
    </span>
  )

  return (
    <div
      className={cn(
        'flex w-full items-end gap-2',
        doUsuario ? 'justify-end' : 'justify-start',
      )}
    >
      {!doUsuario && <div aria-hidden>{avatar}</div>}

      <div className="flex max-w-[calc(78%-2rem)] flex-col gap-2 sm:max-w-[calc(70%-2rem)] lg:max-w-[calc(62%-2rem)]">
        {mensagem.recibos.map((recibo, indice) => (
          <CartaoDeRegistro key={`${recibo.tipo}-${recibo.id}-${indice}`} recibo={recibo} />
        ))}

        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 text-[0.8125rem] leading-relaxed shadow-sm',
            doUsuario
              ? 'rounded-br-md bg-primary text-primary-foreground'
              : recusa
                ? 'rounded-bl-md border border-destructive/30 bg-destructive-muted text-destructive'
                : 'rounded-bl-md border border-border bg-card text-card-foreground',
          )}
        >
          {transcrevendo ? (
            <div className="flex items-center gap-2 py-0.5">
              <AudioLines className="size-4 shrink-0 animate-pulse" aria-hidden />
              <span className="opacity-80">{t('chat.message.transcribing')}</span>
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {doUsuario ? mensagem.conteudo : <TextoDaIA texto={mensagem.conteudo} />}
            </div>
          )}

          <div
            className={cn(
              'mt-1 flex items-center justify-end gap-1 text-[0.6875rem] leading-none',
              doUsuario
                ? 'text-primary-foreground/70'
                : recusa
                  ? 'text-destructive/70'
                  : 'text-muted-foreground',
            )}
          >
            {mensagem.origem === 'AUDIO' && (
              <>
                <Mic className="size-3" aria-hidden />
                <span className="sr-only">{t('chat.message.fromAudio')}</span>
              </>
            )}
            <time dateTime={mensagem.criadaEm}>{horario}</time>
          </div>
        </div>
      </div>

      {doUsuario && <div aria-hidden>{avatar}</div>}
    </div>
  )
}

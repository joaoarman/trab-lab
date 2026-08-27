import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, ChevronDown, EyeOff, Mic, Sparkles, Wrench } from 'lucide-react'

import { PerfilAvatar } from '@/shared/components/PerfilAvatar'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible'
import { useAuth } from '@/shared/context/AuthContext'
import { rotuloDoDia } from '@/shared/data/extrato'
import { urlDoAvatar } from '@/shared/lib/avatar'
import { cn } from '@/shared/lib/utils'
import type { MensagemDaIA } from '@/shared/data/model'
import { formatNumber } from '@/shared/i18n/format'
import { custoDeIA } from './custo'

export function LinhaDoLog({ mensagem }: { mensagem: MensagemDaIA }) {
  const { t, i18n } = useTranslation()
  const { perfil } = useAuth()
  const [aberta, setAberta] = useState(false)

  const doUsuario = mensagem.papel === 'USER'
  const recusa = mensagem.tipo === 'REFUSAL'
  const temDetalhe = mensagem.ferramentas.length > 0

  const horario = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(mensagem.criadaEm))

  return (
    <li
      className={cn(
        'rounded-lg border border-border bg-card p-3',
        recusa && 'border-destructive/30 bg-destructive-muted/40',
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {doUsuario ? (
          <span aria-hidden className="mt-0.5 shrink-0">
            <PerfilAvatar
              url={perfil ? urlDoAvatar(perfil) : null}
              nome={perfil?.nome ?? ''}
              className="size-6"
              classNameFallback="text-[0.625rem]"
              tamanhoDoIcone="size-3"
            />
          </span>
        ) : (
          <span
            aria-hidden
            className={cn(
              'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full',
              recusa
                ? 'bg-destructive-muted text-destructive'
                : 'bg-primary-muted text-primary-muted-foreground',
            )}
          >
            {recusa ? <Ban className="size-3.5" /> : <Sparkles className="size-3.5" />}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">
            {mensagem.conteudo}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
            <span className="sr-only">
              {t(doUsuario ? 'log.entry.fromUser' : 'log.entry.fromAssistant')}
            </span>
            <time dateTime={mensagem.criadaEm}>{horario}</time>

            {mensagem.origem === 'AUDIO' && (
              <Badge variant="outline" className="gap-1 font-normal">
                <Mic className="size-3" aria-hidden />
                {t('log.entry.audio')}
              </Badge>
            )}

            {!mensagem.naConversa && (
              <Badge variant="outline" className="gap-1 font-normal">
                <EyeOff className="size-3" aria-hidden />
                {t('log.entry.cleared')}
              </Badge>
            )}

            {mensagem.modelo && (
              <Badge variant="secondary" className="font-mono font-normal">
                {mensagem.modelo}
              </Badge>
            )}
          </div>
        </div>

        <div className="ml-auto shrink-0 text-right">
          <p className="font-mono text-sm font-medium text-foreground">
            {mensagem.custoEmCentavosDeDolar === null
              ? '—'
              : custoDeIA(mensagem.custoEmCentavosDeDolar, 'linha')}
          </p>
          {(mensagem.tokensEntrada !== null || mensagem.tokensSaida !== null) && (
            <p className="mt-0.5 font-mono text-[0.6875rem] text-muted-foreground">
              {t('log.entry.tokens', {
                input: formatNumber(mensagem.tokensEntrada ?? 0),
                output: formatNumber(mensagem.tokensSaida ?? 0),
              })}
              {mensagem.tokensEntradaCacheados ? (
                <span className="ml-1">
                  {t('log.entry.cached', {
                    value: formatNumber(mensagem.tokensEntradaCacheados),
                  })}
                </span>
              ) : null}
            </p>
          )}
        </div>
      </div>

      {temDetalhe && (
        <Collapsible open={aberta} onOpenChange={setAberta} className="mt-2">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
            >
              <Wrench className="size-3.5" aria-hidden />
              {t('log.entry.tools', { count: mensagem.ferramentas.length })}
              <ChevronDown
                className={cn('size-3.5 transition-transform', aberta && 'rotate-180')}
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <ul className="mt-2 space-y-2">
              {mensagem.ferramentas.map((ferramenta, indice) => (
                <li
                  key={`${ferramenta.nome}-${indice}`}
                  className="rounded-md border border-border bg-muted/40 p-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-xs font-medium text-foreground">
                      {ferramenta.nome}
                    </code>
                    <Badge
                      variant={ferramenta.ok ? 'secondary' : 'destructive'}
                      className="font-normal"
                    >
                      {t(ferramenta.ok ? 'log.entry.toolOk' : 'log.entry.toolFailed')}
                    </Badge>
                  </div>

                  {ferramenta.erro && (
                    <p className="mt-1.5 text-xs text-destructive">{ferramenta.erro}</p>
                  )}

                  <pre className="mt-1.5 overflow-x-auto rounded bg-background p-2 font-mono text-[0.6875rem] leading-relaxed text-muted-foreground">
                    {JSON.stringify(ferramenta.argumentos, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </li>
  )
}

export function DiaDoLog({ data, children }: { data: string; children: ReactNode }) {
  return (
    <section className="space-y-2" aria-label={rotuloDoDia(data)}>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {rotuloDoDia(data)}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}

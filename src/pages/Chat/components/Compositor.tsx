import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Pause, SendHorizonal, Square, Trash2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { OndaDeVoz } from './OndaDeVoz'
import { MAX_SEGUNDOS, useGravador } from './useGravador'

/**
 * A barra de baixo — onde o usuário fala com a IA, escrevendo ou gravando.
 *
 * Ela tem **dois modos e um lugar só**: em repouso é o campo de texto; enquanto
 * grava, o campo dá lugar ao cronômetro e à onda de voz, com os controles à
 * direita. Trocar o conteúdo da mesma barra (em vez de abrir um painel por cima)
 * mantém o botão de enviar exatamente onde o polegar já estava.
 *
 * ## A ordem dos controles na gravação
 *
 * `[00:12]  [~~~ onda ~~~]          [🗑] [⏸] [➤]`
 *
 * O tempo à esquerda e a onda logo depois dele, de **largura fixa** (ver
 * `OndaDeVoz`): o espaço que sobra até os botões fica vazio mesmo. Os três botões
 * ficam juntos à direita, na ordem do risco — descartar longe do polegar, enviar
 * embaixo dele.
 *
 * O ⏸ existe para **ouvir antes de mandar**: pausado, a onda dá lugar a um player
 * com o que já foi gravado, e retomar continua o mesmo arquivo em vez de começar
 * outro.
 *
 * ## O áudio não volta para o campo
 *
 * Enviar encerra, transcreve e manda para a IA de uma vez — o usuário não revisa a
 * transcrição em forma de texto antes. É uma escolha, e é a premissa do produto:
 * quem dita um gasto na fila do mercado quer falar e guardar o celular. Para conferir, há o ⏸, que deixa ouvir a própria voz — mais
 * rápido do que ler.
 *
 * O preço é a transcrição errada virar mensagem, e a saída para isso é a própria
 * conversa: a IA mostra o cartão com o valor que entendeu, e corrigir é uma frase
 * ("na verdade foram 45").
 */
export function Compositor({
  onEnviarTexto,
  onEnviarAudio,
  onErroDeGravacao,
  ocupado,
}: {
  onEnviarTexto: (texto: string) => void
  onEnviarAudio: (audio: Blob) => void
  /** A tela mostra o aviso: microfone negado ou navegador sem suporte. */
  onErroDeGravacao: (erro: 'permission_denied' | 'unsupported') => void
  /** A IA está transcrevendo ou respondendo — não se manda outra por cima. */
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

  // O campo cresce com o texto até um teto e então rola: mensagem longa não pode
  // empurrar a conversa inteira para fora da tela.
  useEffect(() => {
    const elemento = campo.current
    if (!elemento) return

    elemento.style.height = 'auto'
    const alturaDoConteudo = elemento.scrollHeight
    elemento.style.height = `${Math.min(alturaDoConteudo, ALTURA_MAXIMA)}px`
    // A barra de rolagem só existe depois do teto. Sem isto, o Chrome mostra uma
    // barrinha minúscula já na primeira linha — a altura calculada empata com o
    // conteúdo por uma fração de pixel, e ele arredonda para "cabe rolagem".
    elemento.style.overflowY = alturaDoConteudo > ALTURA_MAXIMA ? 'auto' : 'hidden'
  }, [texto])

  useEffect(() => {
    if (erro) onErroDeGravacao(erro)
  }, [erro, onErroDeGravacao])

  async function encerrarEEnviar() {
    const audio = await parar()
    // Áudio vazio (o usuário tocou e soltou na mesma hora) some em silêncio — não
    // é erro, e um aviso ali seria ruído por um toque acidental.
    if (audio && audio.size > 0) onEnviarAudio(audio)
  }

  // No teto de 5 minutos a gravação encerra E VAI — em vez de sumir, que jogaria
  // fora o que a pessoa acabou de falar.
  useEffect(() => {
    if (gravando && segundos >= MAX_SEGUNDOS) void encerrarEEnviar()
    // Só o cronômetro reagenda este efeito. `encerrarEEnviar` é recriada a cada
    // render e, na lista de dependências, faria o efeito rodar de novo a cada
    // barra da onda que entra.
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
    // `px-3` e não `px-content`: numa tela que É a conversa, o respiro lateral é o
    // mesmo do vertical (12px), e não o enquadramento de 24px que separa uma página
    // do resto do app. Tem de bater com o da lista de mensagens — os dois desenham
    // a mesma margem, e um pixel de diferença apareceria como um degrau no canto.
    <div className="shrink-0 border-t border-border bg-background px-3 py-3">
      {emGravacao ? (
        <div className="mx-auto flex w-full max-w-content items-center gap-2 sm:gap-3">
          {/* `aria-live` no cronômetro: para quem não vê a onda, é ele que diz que
              a gravação está correndo. `tabular-nums` para os dígitos não dançarem
              a cada segundo. */}
          <span className="shrink-0 font-mono text-sm tabular-nums text-foreground" aria-live="polite">
            {minutos}:{restoDosSegundos}
          </span>

          {/* `min-w-0` no meio: sem ele, o item de flex não encolhe abaixo do
              conteúdo e a onda empurraria os botões para fora no celular. */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {pausado && previa ? (
              // Pausado, a onda dá lugar ao player: é o momento de ouvir, não de
              // ver o volume de um microfone parado. `controls` nativo porque o
              // navegador já resolve play, tempo e barra — e no celular ele vem no
              // tamanho certo para o polegar.
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
              {/* Pausado, o ícone é o de VOLTAR A GRAVAR (um ponto de captura), e
                  não um "play" — play, ao lado de um player, seria lido como
                  "tocar o áudio", que é o que o player ali do lado já faz. */}
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
              // Enter manda, Shift+Enter quebra linha. No celular o teclado traz a
              // tecla de nova linha, então o envio é pelo botão — por isso o
              // `enterKeyHint`, que troca o rótulo da tecla para "enviar".
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

          {/* Um botão só, e ele muda de papel: microfone com o campo vazio, enviar
              assim que há o que enviar. Dois botões lado a lado disputariam o mesmo
              canto e o polegar erraria o alvo. */}
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

/**
 * Até onde o campo de texto cresce, em pixels.
 *
 * Bate com o `max-h-40` da classe (160px). Os dois existem porque a altura é
 * medida em JavaScript e limitada em CSS: sem o número aqui, a decisão de mostrar
 * ou não a barra de rolagem não teria contra o que comparar.
 */
const ALTURA_MAXIMA = 160

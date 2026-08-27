import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/components/ui/sonner'
import type { MensagemDaIA, OrigemDaMensagem } from '@/shared/data/model'
import { dataLocal } from '@/shared/utils/datas'
import {
  codigoDeErroDoChat,
  enviarMensagem,
  listarMensagens,
  TAMANHO_DA_PAGINA,
  transcreverAudio,
  type ExtratoDeIA,
} from './supabase'
import { Bolha } from './components/Bolha'
import { BoasVindasDoChat } from './components/BoasVindasDoChat'
import { Compositor } from './components/Compositor'
import { DialogoDeLimpeza } from './components/DialogoDeLimpeza'
import { Digitando } from './components/Digitando'
import { SeparadorDeDia } from './components/SeparadorDeDia'

type MensagemNaTela = MensagemDaIA & { transcrevendo?: boolean }

function agruparPorDia(mensagens: MensagemNaTela[]): { dia: string; mensagens: MensagemNaTela[] }[] {
  const grupos: { dia: string; mensagens: MensagemNaTela[] }[] = []

  for (const mensagem of mensagens) {
    const dia = dataLocal(mensagem.criadaEm)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.dia === dia) ultimo.mensagens.push(mensagem)
    else grupos.push({ dia, mensagens: [mensagem] })
  }

  return grupos
}

export function ChatPage() {
  const { t, i18n } = useTranslation()

  const [mensagens, setMensagens] = useState<MensagemNaTela[]>([])
  const [carregando, setCarregando] = useState(true)
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false)
  const [temAnteriores, setTemAnteriores] = useState(false)
  const [respondendo, setRespondendo] = useState(false)
  const [transcrevendo, setTranscrevendo] = useState(false)
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false)

  const lista = useRef<HTMLDivElement>(null)
  const grudadoNoFim = useRef(true)

  const ocupado = respondendo || transcrevendo

  const avisarErro = useCallback(
    (falha: unknown) => {
      toast.error(t(`chat.errors.${codigoDeErroDoChat(falha)}`))
    },
    [t],
  )

  useEffect(() => {
    let ativo = true

    listarMensagens()
      .then((primeiras) => {
        if (!ativo) return
        setMensagens(primeiras)
        setTemAnteriores(primeiras.length === TAMANHO_DA_PAGINA)
      })
      .catch(avisarErro)
      .finally(() => {
        if (ativo) setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [avisarErro])

  useLayoutEffect(() => {
    if (!grudadoNoFim.current) return
    const elemento = lista.current
    if (elemento) elemento.scrollTop = elemento.scrollHeight
  }, [mensagens, respondendo])

  function aoRolar() {
    const elemento = lista.current
    if (!elemento) return

    const distanciaDoFim = elemento.scrollHeight - elemento.scrollTop - elemento.clientHeight
    grudadoNoFim.current = distanciaDoFim < 80
  }

  async function carregarAnteriores() {
    const elemento = lista.current
    const primeira = mensagens[0]
    if (!elemento || !primeira || carregandoAnteriores) return

    setCarregandoAnteriores(true)
    const alturaAntes = elemento.scrollHeight

    try {
      const antigas = await listarMensagens(primeira.id)
      setMensagens((atuais) => [...antigas, ...atuais])
      setTemAnteriores(antigas.length === TAMANHO_DA_PAGINA)

      requestAnimationFrame(() => {
        elemento.scrollTop += elemento.scrollHeight - alturaAntes
      })
    } catch (falha) {
      avisarErro(falha)
    } finally {
      setCarregandoAnteriores(false)
    }
  }

  function abrirBolha(texto: string, origem: OrigemDaMensagem, ehTranscricao = false): number {
    const id = -Date.now()

    grudadoNoFim.current = true
    setMensagens((atuais) => [
      ...atuais,
      {
        id,
        papel: 'USER',
        conteudo: texto,
        origem,
        tipo: 'MESSAGE',
        recibos: [],
        ferramentas: [],
        modelo: null,
        tokensEntrada: null,
        tokensEntradaCacheados: null,
        tokensSaida: null,
        custoEmCentavosDeDolar: null,
        naConversa: true,
        criadaEm: new Date().toISOString(),
        transcrevendo: ehTranscricao,
      },
    ])

    return id
  }

  function fecharBolha(id: number) {
    setMensagens((atuais) => atuais.filter((mensagem) => mensagem.id !== id))
  }

  async function conversar(
    idProvisorio: number,
    texto: string,
    origem: OrigemDaMensagem,
    iaDaTranscricao: ExtratoDeIA | null,
    aoFalhar?: () => void,
  ) {
    setRespondendo(true)

    try {
      const turno = await enviarMensagem({
        texto,
        origem,
        hoje: dataLocal(),
        diaDaSemana: new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(new Date()),
        fusoEmMinutos: new Date().getTimezoneOffset(),
        idioma: i18n.language,
        transcricao: iaDaTranscricao,
      })
      setMensagens((atuais) => [...atuais.filter((m) => m.id !== idProvisorio), ...turno])
    } catch (falha) {
      fecharBolha(idProvisorio)
      avisarErro(falha)
      aoFalhar?.()
    } finally {
      setRespondendo(false)
    }
  }

  function enviarTexto(texto: string) {
    if (ocupado) return
    void conversar(abrirBolha(texto, 'TEXT'), texto, 'TEXT', null)
  }

  async function enviarAudio(audio: Blob) {
    if (ocupado) return

    const id = abrirBolha('', 'AUDIO', true)
    setTranscrevendo(true)

    try {
      const transcricao = await transcreverAudio(audio)

      if (!transcricao.texto) {
        fecharBolha(id)
        return
      }

      setMensagens((atuais) =>
        atuais.map((mensagem) =>
          mensagem.id === id
            ? { ...mensagem, conteudo: transcricao.texto, transcrevendo: false }
            : mensagem,
        ),
      )

      await conversar(id, transcricao.texto, 'AUDIO', transcricao.ia)
    } catch (falha) {
      fecharBolha(id)
      avisarErro(falha)
    } finally {
      setTranscrevendo(false)
    }
  }

  const conversaVazia = !carregando && mensagens.length === 0

  return (
    <div className="flex h-full flex-col bg-muted/30">
      {!conversaVazia && (
        <div className="flex shrink-0 items-center justify-end px-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={carregando || ocupado}
            onClick={() => setConfirmarLimpeza(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            {t('chat.clear.action')}
          </Button>
        </div>
      )}

      <div ref={lista} onScroll={aoRolar} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-content flex-col justify-end gap-2 px-3 py-4">
          {carregando ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-label={t('common.loading')} />
            </div>
          ) : conversaVazia ? (
            <BoasVindasDoChat onEscolher={enviarTexto} />
          ) : (
            <>
              {temAnteriores && (
                <div className="flex justify-center pb-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={carregandoAnteriores}
                    onClick={() => void carregarAnteriores()}
                  >
                    {carregandoAnteriores && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {t('chat.loadPrevious')}
                  </Button>
                </div>
              )}

              {agruparPorDia(mensagens).map((grupo) => (
                <section key={grupo.dia} className="flex flex-col gap-2">
                  <SeparadorDeDia dia={grupo.dia} />
                  {grupo.mensagens.map((mensagem) => (
                    <Bolha
                      key={mensagem.id}
                      mensagem={mensagem}
                      transcrevendo={mensagem.transcrevendo}
                    />
                  ))}
                </section>
              ))}

              {respondendo && <Digitando />}
            </>
          )}
        </div>
      </div>

      <Compositor
        ocupado={ocupado}
        onEnviarTexto={enviarTexto}
        onEnviarAudio={(audio) => void enviarAudio(audio)}
        onErroDeGravacao={(erro) => toast.error(t(`chat.recording.${erro}`))}
      />

      <DialogoDeLimpeza
        aberto={confirmarLimpeza}
        onFechar={() => setConfirmarLimpeza(false)}
        onLimpo={() => {
          setMensagens([])
          setTemAnteriores(false)
          setConfirmarLimpeza(false)
        }}
      />
    </div>
  )
}

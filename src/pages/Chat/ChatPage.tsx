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

/**
 * O Chat — o coração do Self OS, e a tela em que o usuário cai ao entrar.
 *
 * ## A tela é uma conversa só, e ela não acaba
 *
 * Não há lista de conversas, título nem "nova conversa": o usuário abre e está
 * onde parou. É a forma certa para o uso pretendido — registrar ao longo do dia,
 * na fila do mercado, no posto —, em que escolher onde falar seria uma decisão a
 * mais antes de cada frase.
 *
 * ## A tela INTEIRA é a conversa — não há moldura
 *
 * Nada de cartão em volta: a lista vai de borda a borda e o compositor fica colado
 * no pé da janela. Moldura é o que se põe num bloco que divide a tela com outra
 * coisa, e aqui não há outra coisa.
 *
 * O enquadramento do tema não sumiu, **desceu**: o `AppLayout` reconhece `/chat`
 * em `ROTAS_DE_TELA_CHEIA` e para de aplicar `max-w-content px-content` em volta;
 * quem cuida disso passa a ser o miolo da lista e o do compositor. Assim o fundo
 * atravessa a tela e o texto não — linha que cruza um monitor de ponta a ponta não
 * se lê. A margem lateral encolhe de 24px para 12px pelo mesmo motivo: 24px é a
 * distância que separa uma página do app em volta, e aqui não há "em volta".
 *
 * ## Por que a altura é travada, e não a rolagem da página
 *
 * A conversa rola **dentro** da lista, com o compositor ancorado embaixo. Se quem
 * rolasse fosse a janela, o campo de escrever subiria junto com o texto e sumiria
 * justamente quando o usuário fosse responder.
 *
 * A altura **não é calculada aqui**: quem trava a janela é o `AppLayout` (`100dvh`
 * + `overflow-hidden` pela cadeia inteira), e esta página só recebe `h-full`. A
 * única rolagem da tela é a da lista, e ela é `overscroll-contain` para o impulso
 * do dedo parar nela em vez de sacudir a janela atrás.
 *
 * ## A ordem das coisas ao enviar
 *
 * A bolha do usuário aparece **na hora** (otimista), os três pontinhos entram
 * embaixo, e as duas são substituídas pelo que o banco devolveu. Se a IA falhar,
 * nada foi gravado: a bolha otimista sai e o texto volta para o campo, para o
 * usuário não perder o que escreveu.
 *
 * No áudio há um passo a mais: a bolha nasce **antes da transcrição**, mostrando
 * que está sendo transcrita, e o texto aparece nela quando fica pronto. Ver
 * `enviarAudio`.
 */

/**
 * Uma mensagem do jeito que a TELA precisa dela.
 *
 * `transcrevendo` só existe aqui, e de propósito: é um estado da bolha enquanto o
 * áudio vira texto, não um fato da conversa. Não há coluna para isso porque não há
 * o que guardar — quando a mensagem chega ao banco, a transcrição já terminou.
 */
type MensagemNaTela = MensagemDaIA & { transcrevendo?: boolean }

/**
 * As mensagens fatiadas por dia.
 *
 * O agrupamento existe por causa da etiqueta grudenta: para o "Ontem" ficar preso
 * no topo **enquanto as mensagens de ontem passam**, ele precisa ser `sticky`
 * dentro de um bloco que contenha exatamente aquelas mensagens. Numa lista plana o
 * `sticky` não teria onde terminar, e a etiqueta de ontem atravessaria a conversa
 * inteira.
 *
 * Não usa `agruparPorDia` de `shared/data/extrato.ts` porque aquela função existe
 * para somar o dia — ela pede um acessor de valor, e uma conversa não tem total.
 */
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
  /** Fica preso no fim enquanto o usuário não subir para ler o passado. */
  const grudadoNoFim = useRef(true)

  /**
   * Uma mensagem por vez. Cobre a transcrição e a resposta da IA — mandar outra
   * por cima embaralharia o contexto que a IA acabou de receber, e as duas
   * poderiam criar a mesma categoria ao mesmo tempo.
   */
  const ocupado = respondendo || transcrevendo

  const avisarErro = useCallback(
    (falha: unknown) => {
      toast.error(t(`chat.errors.${codigoDeErroDoChat(falha)}`))
    },
    [t],
  )

  // ---- Carga inicial ----
  useEffect(() => {
    let ativo = true

    listarMensagens()
      .then((primeiras) => {
        if (!ativo) return
        setMensagens(primeiras)
        // Página cheia significa que provavelmente há mais para trás. Uma página
        // incompleta encerra o assunto sem uma segunda consulta.
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

  // ---- Rolagem ----
  // `useLayoutEffect` porque a rolagem precisa acontecer ANTES da pintura: com
  // `useEffect`, a mensagem nova aparece no meio da tela e só então salta para o
  // fim, e o salto é visível.
  useLayoutEffect(() => {
    if (!grudadoNoFim.current) return
    const elemento = lista.current
    if (elemento) elemento.scrollTop = elemento.scrollHeight
  }, [mensagens, respondendo])

  function aoRolar() {
    const elemento = lista.current
    if (!elemento) return

    // 80px de folga: quem está "quase" no fim continua sendo levado junto pelas
    // mensagens novas. Exigir o fim exato faria a tela parar de acompanhar por
    // causa de um arraste de dois dedos.
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

      // Sem isto, inserir conteúdo acima empurra a leitura para baixo e o usuário
      // perde a linha que estava lendo. Devolver a diferença de altura mantém a
      // tela exatamente onde estava.
      requestAnimationFrame(() => {
        elemento.scrollTop += elemento.scrollHeight - alturaAntes
      })
    } catch (falha) {
      avisarErro(falha)
    } finally {
      setCarregandoAnteriores(false)
    }
  }

  // ---- Enviar ----

  /** Cria a bolha otimista e a coloca no fim da conversa. Devolve o id dela. */
  function abrirBolha(texto: string, origem: OrigemDaMensagem, ehTranscricao = false): number {
    // Id negativo: nunca colide com o do banco (que é sempre positivo) e
    // identifica a bolha otimista na hora de trocá-la ou tirá-la.
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
        // A bolha otimista ainda não tem extrato: quem o grava é o banco, e ela é
        // substituída pela linha real quando a IA responde.
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

  /**
   * A conversa em si: manda para a IA e troca a bolha otimista pelo turno real.
   *
   * `aoFalhar` existe só para o texto: quando o envio quebra, a frase volta para o
   * campo. Um áudio não tem para onde voltar — o arquivo já não existe —, então ali
   * o aviso de erro é o fim da linha.
   */
  async function conversar(
    idProvisorio: number,
    texto: string,
    origem: OrigemDaMensagem,
    // O extrato da transcrição, quando veio de áudio. A tela só o carrega da
    // função que transcreveu até a que grava a linha.
    iaDaTranscricao: ExtratoDeIA | null,
    aoFalhar?: () => void,
  ) {
    setRespondendo(true)

    try {
      const turno = await enviarMensagem({
        texto,
        origem,
        hoje: dataLocal(),
        // O nome do dia por extenso sai do idioma ativo e vai junto no prompt: é o
        // que evita a IA errar "sexta passada" fazendo conta de calendário.
        diaDaSemana: new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(new Date()),
        // O fuso do navegador. Sem ele, uma data dita pela IA ("ontem") seria
        // convertida em UTC no servidor e cairia no dia errado para quem não está
        // em Londres.
        fusoEmMinutos: new Date().getTimezoneOffset(),
        idioma: i18n.language,
        transcricao: iaDaTranscricao,
      })
      // A provisória sai e as duas do banco entram — com os ids de verdade e, se
      // houve registro, com os cartões de confirmação.
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

  /**
   * O áudio vira bolha ANTES de ser transcrito.
   *
   * A bolha entra na conversa no instante em que o usuário solta o botão, já do
   * lado dele, dizendo que está sendo transcrita — e o texto aparece dentro dela
   * quando fica pronto, sem a bolha mudar de lugar.
   *
   * A alternativa seria o botão de enviar esperando com um spinner, e a mensagem
   * só surgindo depois de pronta. A diferença é o que a espera comunica: no botão,
   * ela é o app pensando; na bolha, é a mensagem dele já enviada e a caminho — que
   * é o que de fato aconteceu, já que o áudio já saiu do aparelho.
   */
  async function enviarAudio(audio: Blob) {
    if (ocupado) return

    const id = abrirBolha('', 'AUDIO', true)
    setTranscrevendo(true)

    try {
      const transcricao = await transcreverAudio(audio)

      // Áudio mudo não vira mensagem em branco para a IA responder: a bolha
      // simplesmente sai. O custo se perde junto, e é o certo — sem mensagem não
      // há linha onde gravá-lo, e meio segundo de áudio custa perto de nada.
      if (!transcricao.texto) {
        fecharBolha(id)
        return
      }

      // A MESMA bolha recebe o texto: sem remover e recriar, para ela não piscar
      // nem pular de posição.
      setMensagens((atuais) =>
        atuais.map((mensagem) =>
          mensagem.id === id
            ? { ...mensagem, conteudo: transcricao.texto, transcrevendo: false }
            : mensagem,
        ),
      )

      // O extrato atravessa daqui: nasceu na função de transcrição e só tem onde
      // morar quando o turno for gravado, do outro lado.
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
      {/* "Limpar conversa" só existe quando há o que limpar: numa conversa vazia
          seria uma ação sem objeto ocupando o alto da tela. A linha fica sobre o
          MESMO fundo da lista, então o olho lê uma superfície só — a conversa —
          com o que precisa no alto dela. */}
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

      {/* `overscroll-contain`: chegando ao fim (ou ao topo) da conversa, o impulso
          do dedo PARA aqui em vez de continuar no que estiver atrás. Sem isso, no
          celular o arrasto vaza para a janela e a tela inteira balança junto. */}
      <div ref={lista} onScroll={aoRolar} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* `justify-end` + `min-h-full`: com pouca conversa, as mensagens ficam
            coladas no compositor e sobem conforme chegam — como em qualquer
            aplicativo de mensagem. Sem isso elas nascem no topo e a conversa parece
            começar longe de onde se escreve. Quando o conteúdo passa da altura, o
            `justify-end` deixa de ter efeito e a rolagem assume.

            É AQUI que o teto de largura entra (`max-w-content`): o fundo vai de
            borda a borda, o texto não. O respiro lateral é `px-3` e não
            `px-content` — e tem de bater com o do `Compositor`, que desenha a mesma
            margem logo abaixo. */}
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

      {/* Portal do Radix: fora do fluxo, então não conta como item deste flex. */}
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

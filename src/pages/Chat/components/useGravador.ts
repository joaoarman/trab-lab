import { useCallback, useEffect, useRef, useState } from 'react'

// =============================================================================
// O gravador de voz do Chat.
//
// Três coisas ao mesmo tempo, e é por isso que elas moram num hook só: o áudio
// que será enviado (`MediaRecorder`), a **onda que se mexe conforme a pessoa
// fala** (um `AnalyserNode` lendo o mesmo microfone) e os segundos correndo.
//
// A onda não é enfeite: sem ela, a única prova de que o microfone está captando é
// o número subindo — e um número sobe igual no silêncio e na fala. Quem dita um
// gasto andando na rua precisa ver a própria voz na tela para saber que vale a
// pena continuar falando.
//
// PAUSAR SERVE PARA OUVIR. Ao pausar, o gravador fecha um pedaço do áudio e
// devolve um endereço tocável (`previa`) — é o que permite conferir o recado antes
// de mandar, sem perder o que já foi dito: retomar continua o MESMO arquivo, não
// começa outro.
//
// TUDO É DESLIGADO AO FIM. As faixas do microfone e o `AudioContext` continuam
// vivos depois que o `MediaRecorder` para, e é isso que mantém a luzinha do
// microfone acesa no aparelho. `desligar()` é chamado em toda saída — parar,
// cancelar, erro e desmontagem do componente.
// =============================================================================

/**
 * Quantas barras a onda tem. É a largura da janela de tempo que se vê.
 *
 * Não é exportada: quem desenha (`OndaDeVoz`) recebe o array pronto e não precisa
 * saber o tamanho dele. Mudar aqui muda a onda inteira, num lugar só.
 */
const BARRAS = 32

/** De quanto em quanto tempo uma barra nova entra, em milissegundos. */
const INTERVALO_MS = 70

/**
 * Teto de gravação: 5 minutos, e aí ela para sozinha e vai.
 *
 * Não é o limite da transcrição (que aguenta muito mais) — é o limite do que faz
 * sentido como recado de gasto. Cinco minutos de fala já são um mês inteiro de
 * lançamentos ditados, e um botão de gravar esquecido apertado no bolso não deve
 * virar uma chamada cara à OpenAI.
 */
export const MAX_SEGUNDOS = 300

export type EstadoDaGravacao = 'parado' | 'gravando' | 'pausado'

export type ErroDeGravacao =
  /** O usuário negou o microfone (ou o navegador negou por não ser HTTPS). */
  | 'permission_denied'
  /** O aparelho ou o navegador não grava áudio. */
  | 'unsupported'

/**
 * O formato que ESTE navegador sabe gravar.
 *
 * Chrome, Firefox e Edge dão WebM/Opus; o Safari, não — ele grava MP4. Escolher na
 * hora, em vez de fixar um, é o que faz o botão funcionar no iPhone. E o formato
 * escolhido determina a extensão do arquivo enviado, que é como a OpenAI decide o
 * decodificador (ver `extensaoDe`, em `../supabase.ts`).
 */
function formatoSuportado(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined

  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return candidatos.find((tipo) => MediaRecorder.isTypeSupported(tipo))
}

export function useGravador() {
  const [estado, setEstado] = useState<EstadoDaGravacao>('parado')
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState<ErroDeGravacao | null>(null)
  const [niveis, setNiveis] = useState<number[]>(() => Array<number>(BARRAS).fill(0))
  /** Endereço tocável do que já foi gravado. Só existe enquanto pausado. */
  const [previa, setPrevia] = useState<string | null>(null)

  const gravador = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const contexto = useRef<AudioContext | null>(null)
  const analisador = useRef<AnalyserNode | null>(null)
  const pedacos = useRef<Blob[]>([])
  const timers = useRef<number[]>([])
  /** Chamado uma vez, no próximo `dataavailable` — é como a prévia é montada. */
  const aposDados = useRef<(() => void) | null>(null)

  const pararTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearInterval(timer))
    timers.current = []
  }, [])

  /**
   * Liga o cronômetro e a onda. Existe como função própria porque os dois param ao
   * pausar e voltam ao retomar — enquanto o que os alimenta (o `AnalyserNode`)
   * continua de pé o tempo todo.
   */
  const ligarTimers = useCallback(() => {
    const analise = analisador.current
    if (!analise) return

    const amostras = new Uint8Array(analise.frequencyBinCount)

    const desenharOnda = window.setInterval(() => {
      analise.getByteTimeDomainData(amostras)

      // RMS sobre a onda crua: a média quadrática do quanto o sinal se afasta do
      // silêncio (128 é o zero de um sinal de 8 bits). É o que corresponde ao
      // volume que a pessoa percebe — um pico isolado não faz a barra saltar.
      let soma = 0
      for (const amostra of amostras) {
        const desvio = (amostra - 128) / 128
        soma += desvio * desvio
      }
      const rms = Math.sqrt(soma / amostras.length)

      // O ×3,2 e o teto em 1 são calibragem: fala normal a um palmo do celular
      // fica em torno de 0,1–0,25 de RMS, e sem amplificar a onda mal sairia do
      // chão. O piso em 0,08 mantém um fio de vida na barra durante as pausas da
      // fala, em vez de uma linha reta que parece travamento.
      const nivel = Math.min(1, Math.max(0.08, rms * 3.2))

      // A barra nova entra à direita e a mais velha sai: é o deslizar que dá a
      // sensação de onda correndo.
      setNiveis((anteriores) => [...anteriores.slice(1), nivel])
    }, INTERVALO_MS)

    const contarSegundos = window.setInterval(() => {
      setSegundos((anterior) => anterior + 1)
    }, 1000)

    timers.current = [desenharOnda, contarSegundos]
  }, [])

  const limparPrevia = useCallback(() => {
    setPrevia((anterior) => {
      // Sem revogar, cada pausa deixa um blob preso na memória da aba.
      if (anterior) URL.revokeObjectURL(anterior)
      return null
    })
  }, [])

  const desligar = useCallback(() => {
    pararTimers()
    aposDados.current = null

    stream.current?.getTracks().forEach((faixa) => faixa.stop())
    stream.current = null

    // `close()` devolve uma promise que não interessa a ninguém aqui; o catch
    // existe porque fechar um contexto já fechado rejeita.
    contexto.current?.close().catch(() => {})
    contexto.current = null
    analisador.current = null

    gravador.current = null
    limparPrevia()
  }, [pararTimers, limparPrevia])

  // Sair da tela no meio de uma gravação não pode deixar o microfone aberto.
  useEffect(() => desligar, [desligar])

  const iniciar = useCallback(async () => {
    setErro(null)

    const formato = formatoSuportado()
    if (!formato || !navigator.mediaDevices?.getUserMedia) {
      setErro('unsupported')
      return false
    }

    let entrada: MediaStream
    try {
      entrada = await navigator.mediaDevices.getUserMedia({
        // O navegador faz o trabalho pesado de limpar o áudio — e a rua, o carro e
        // o supermercado são exatamente os ambientes barulhentos em que isso
        // decide se a transcrição acerta o valor ou não.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch {
      // Negar a permissão e não ter microfone caem aqui do mesmo jeito. Para quem
      // usa, a saída é a mesma: liberar o microfone e tentar de novo.
      setErro('permission_denied')
      return false
    }

    stream.current = entrada
    pedacos.current = []

    const recorder = new MediaRecorder(entrada, { mimeType: formato })
    recorder.ondataavailable = (evento) => {
      if (evento.data.size > 0) pedacos.current.push(evento.data)
      // A prévia da pausa é montada aqui: `requestData()` só entrega o áudio neste
      // evento, e antes dele não há o que tocar.
      const pendente = aposDados.current
      if (pendente) {
        aposDados.current = null
        pendente()
      }
    }
    recorder.start()
    gravador.current = recorder

    const AudioContextDoNavegador =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const audio = new AudioContextDoNavegador()
    const analise = audio.createAnalyser()
    // 512 amostras bastam para medir volume e são baratas o bastante para rodar
    // num celular sem esquentar. Não estamos desenhando espectro.
    analise.fftSize = 512
    audio.createMediaStreamSource(entrada).connect(analise)
    contexto.current = audio
    analisador.current = analise

    setSegundos(0)
    setNiveis(Array<number>(BARRAS).fill(0))
    ligarTimers()
    setEstado('gravando')
    return true
  }, [ligarTimers])

  /**
   * Pausa e prepara a prévia — pausar existe justamente para poder ouvir.
   *
   * O blob é montado com **todos** os pedaços desde o começo, e não só com o
   * último: o cabeçalho do arquivo está no primeiro deles, e um pedaço solto do
   * meio não toca em navegador nenhum.
   */
  const pausar = useCallback(() => {
    const recorder = gravador.current
    if (!recorder || recorder.state !== 'recording') return

    aposDados.current = () => {
      const blob = new Blob(pedacos.current, { type: recorder.mimeType })
      const url = URL.createObjectURL(blob)
      setPrevia((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior)
        return url
      })
    }

    recorder.requestData()
    recorder.pause()
    pararTimers()
    setEstado('pausado')
  }, [pararTimers])

  /** Retoma o MESMO arquivo — o que já foi dito continua lá. */
  const retomar = useCallback(() => {
    const recorder = gravador.current
    if (!recorder || recorder.state !== 'paused') return

    limparPrevia()
    recorder.resume()
    ligarTimers()
    setEstado('gravando')
  }, [ligarTimers, limparPrevia])

  /**
   * Encerra e devolve o áudio. `null` quando não há nada gravado.
   *
   * A promise resolve no evento `stop` do `MediaRecorder`, e não na hora: o último
   * pedaço de áudio só chega depois dele. Resolver antes cortaria a última palavra
   * — que, num recado curto de gasto, costuma ser justamente o valor.
   */
  const parar = useCallback((): Promise<Blob | null> => {
    const recorder = gravador.current
    if (!recorder || recorder.state === 'inactive') {
      desligar()
      setEstado('parado')
      return Promise.resolve(null)
    }

    return new Promise<Blob | null>((resolver) => {
      recorder.onstop = () => {
        const partes = pedacos.current
        const audio = partes.length ? new Blob(partes, { type: recorder.mimeType }) : null
        pedacos.current = []
        desligar()
        setEstado('parado')
        setSegundos(0)
        resolver(audio)
      }
      // `stop()` funciona igual a partir do estado pausado — enviar sem retomar é
      // um caminho legítimo, e o mais provável depois de ouvir a prévia.
      recorder.stop()
    })
  }, [desligar])

  /** Descarta a gravação sem devolver nada. */
  const cancelar = useCallback(() => {
    const recorder = gravador.current
    if (recorder && recorder.state !== 'inactive') {
      // Sem `onstop`: o que foi gravado é jogado fora com os pedaços.
      recorder.onstop = null
      recorder.stop()
    }
    pedacos.current = []
    desligar()
    setEstado('parado')
    setSegundos(0)
  }, [desligar])

  return { estado, segundos, niveis, previa, erro, iniciar, pausar, retomar, parar, cancelar }
}

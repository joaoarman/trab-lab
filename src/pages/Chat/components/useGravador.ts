import { useCallback, useEffect, useRef, useState } from 'react'

const BARRAS = 32

const INTERVALO_MS = 70

export const MAX_SEGUNDOS = 300

export type EstadoDaGravacao = 'parado' | 'gravando' | 'pausado'

export type ErroDeGravacao =
  | 'permission_denied'
  | 'unsupported'

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
  const [previa, setPrevia] = useState<string | null>(null)

  const gravador = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const contexto = useRef<AudioContext | null>(null)
  const analisador = useRef<AnalyserNode | null>(null)
  const pedacos = useRef<Blob[]>([])
  const timers = useRef<number[]>([])
  const aposDados = useRef<(() => void) | null>(null)

  const pararTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearInterval(timer))
    timers.current = []
  }, [])

  const ligarTimers = useCallback(() => {
    const analise = analisador.current
    if (!analise) return

    const amostras = new Uint8Array(analise.frequencyBinCount)

    const desenharOnda = window.setInterval(() => {
      analise.getByteTimeDomainData(amostras)

      let soma = 0
      for (const amostra of amostras) {
        const desvio = (amostra - 128) / 128
        soma += desvio * desvio
      }
      const rms = Math.sqrt(soma / amostras.length)

      const nivel = Math.min(1, Math.max(0.08, rms * 3.2))

      setNiveis((anteriores) => [...anteriores.slice(1), nivel])
    }, INTERVALO_MS)

    const contarSegundos = window.setInterval(() => {
      setSegundos((anterior) => anterior + 1)
    }, 1000)

    timers.current = [desenharOnda, contarSegundos]
  }, [])

  const limparPrevia = useCallback(() => {
    setPrevia((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior)
      return null
    })
  }, [])

  const desligar = useCallback(() => {
    pararTimers()
    aposDados.current = null

    stream.current?.getTracks().forEach((faixa) => faixa.stop())
    stream.current = null

    contexto.current?.close().catch(() => {})
    contexto.current = null
    analisador.current = null

    gravador.current = null
    limparPrevia()
  }, [pararTimers, limparPrevia])

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
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch {
      setErro('permission_denied')
      return false
    }

    stream.current = entrada
    pedacos.current = []

    const recorder = new MediaRecorder(entrada, { mimeType: formato })
    recorder.ondataavailable = (evento) => {
      if (evento.data.size > 0) pedacos.current.push(evento.data)
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

  const retomar = useCallback(() => {
    const recorder = gravador.current
    if (!recorder || recorder.state !== 'paused') return

    limparPrevia()
    recorder.resume()
    ligarTimers()
    setEstado('gravando')
  }, [ligarTimers, limparPrevia])

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
      recorder.stop()
    })
  }, [desligar])

  const cancelar = useCallback(() => {
    const recorder = gravador.current
    if (recorder && recorder.state !== 'inactive') {
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

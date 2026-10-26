import { useEffect, useRef, useState } from 'react'
import { IconMic, IconStop } from '../icons'
import { AudioTooShortError, processRecordedAudio } from '../../utils/audioEncoder'

/**
 * Função mantida para retrocompatibilidade, codificando com alta fidelidade e duração garantida.
 */
export async function encodeRecordingAsMp3(blob: Blob): Promise<Blob> {
  const result = await processRecordedAudio(blob, 0.2)
  return result.file
}

export function useAudioRecorder({
  onDone,
  onRecordingChange,
  onError,
  resetKey,
}: {
  onDone: (file: File) => void
  onRecordingChange: (recording: boolean, elapsedSeconds: number) => void
  onError: (message: string) => void
  resetKey: number
}) {
  const [recording, setRecording] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lifecycleRef = useRef(0)

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    startedAtRef.current = null
  }

  const releaseResources = () => {
    stopTimer()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    mediaRef.current = null
  }

  useEffect(() => {
    lifecycleRef.current += 1
    const recorder = mediaRef.current
    if (recorder) {
      recorder.onstop = null
      recorder.onerror = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    releaseResources()
    chunksRef.current = []
    setRecording(false)
    onRecordingChange(false, 0)
  }, [resetKey, onRecordingChange])

  useEffect(() => () => {
    lifecycleRef.current += 1
    const recorder = mediaRef.current
    if (recorder) {
      recorder.onstop = null
      recorder.onerror = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    releaseResources()
    onRecordingChange(false, 0)
  }, [onRecordingChange])

  const stop = () => {
    const recorder = mediaRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        // Solicita descarregamento imediato de todos os dados residuais para o ondataavailable
        if (recorder.state === 'recording') {
          recorder.requestData()
        }
      } catch {
        // Ignora caso já esteja finalizando
      }
      recorder.stop()
    }
  }

  const toggle = async () => {
    if (recording) {
      stop()
      return
    }
    if (!window.isSecureContext) {
      onError('O microfone exige HTTPS ou acesso por localhost')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('Este navegador não oferece suporte à gravação de áudio')
      return
    }
    try {
      const lifecycle = lifecycleRef.current
      // Captura otimizada para voz com supressão de ruído, cancelamento de eco e ganho automático
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 44100,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      if (lifecycle !== lifecycleRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((candidate) => candidate && MediaRecorder.isTypeSupported(candidate))
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        const mimeType = rec.mimeType || 'audio/webm'
        const chunks = [...chunksRef.current]
        const startedAt = startedAtRef.current
        const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0

        releaseResources()
        setRecording(false)
        onRecordingChange(false, 0)

        // Previne envio de áudios acidentais ou sem conteúdo audível (< 0.5s)
        if (elapsed < 0.5 || chunks.length === 0) {
          onError('Áudio muito curto (mínimo de 0,5s). Segure para falar.')
          return
        }

        const rawBlob = new Blob(chunks, { type: mimeType })
        if (rawBlob.size === 0) {
          onError('A gravação ficou vazia. Tente novamente')
          return
        }

        try {
          // Processa, valida duração real e gera MP3 com duração finita garantida
          const { file } = await processRecordedAudio(rawBlob, 0.5)
          onDone(file)
        } catch (err: unknown) {
          if (err instanceof AudioTooShortError) {
            onError(err.message)
          } else {
            console.error('[useAudioRecorder] Falha ao processar gravação:', err)
            onError('Não foi possível processar o áudio gravado.')
          }
        }
      }
      rec.onerror = () => {
        setRecording(false)
        releaseResources()
        onRecordingChange(false, 0)
        onError('Não foi possível gravar o áudio')
      }
      rec.start(250)
      mediaRef.current = rec
      startedAtRef.current = Date.now()
      setRecording(true)
      onRecordingChange(true, 0)
      timerRef.current = setInterval(() => {
        const startedAt = startedAtRef.current
        if (startedAt !== null) onRecordingChange(true, Math.floor((Date.now() - startedAt) / 1000))
      }, 250)
    } catch (err) {
      const name = (err && typeof err === 'object' && 'name' in err) ? String((err as { name?: unknown }).name) : ''
      onError(
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'Permita o acesso ao microfone nas configurações do navegador'
          : name === 'NotFoundError' || name === 'DevicesNotFoundError'
            ? 'Nenhum microfone foi encontrado'
            : 'Não foi possível acessar o microfone',
      )
    }
  }

  return { recording, toggle, stop }
}

export function AudioRecordButton({
  recording,
  disabled,
  onClick,
}: {
  recording: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`composer-action ${recording ? 'recording' : ''}`}
      title={recording ? 'Parar gravação' : 'Gravar áudio'}
      aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
      disabled={disabled}
      onClick={onClick}
    >
      {recording ? <IconStop size={15} /> : <IconMic size={15} />}
      <span>{recording ? 'Parar' : 'Gravar áudio'}</span>
    </button>
  )
}

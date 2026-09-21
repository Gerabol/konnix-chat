import { useEffect, useRef, useState } from 'react'
import { IconMic, IconStop } from '../icons'

export async function encodeRecordingAsMp3(blob: Blob): Promise<Blob> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const encoderModule = await import('lamejs')
    const encoder = new encoderModule.Mp3Encoder(1, decoded.sampleRate, 128)
    const firstChannel = decoded.getChannelData(0)
    const secondChannel = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : null
    const samples = new Int16Array(firstChannel.length)
    for (let index = 0; index < firstChannel.length; index += 1) {
      const mixed = secondChannel ? (firstChannel[index] + secondChannel[index]) / 2 : firstChannel[index]
      const sample = Math.max(-1, Math.min(1, mixed))
      samples[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }
    const parts: BlobPart[] = []
    for (let offset = 0; offset < samples.length; offset += 1152) {
      const encoded = encoder.encodeBuffer(samples.subarray(offset, offset + 1152))
      if (encoded.length > 0) parts.push(new Uint8Array(encoded))
    }
    const flushed = encoder.flush()
    if (flushed.length > 0) parts.push(new Uint8Array(flushed))
    return new Blob(parts, { type: 'audio/mpeg' })
  } finally {
    await context.close()
  }
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
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop()
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
        releaseResources()
        const mimeType = rec.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setRecording(false)
        onRecordingChange(false, 0)
        if (blob.size === 0) {
          onError('A gravação ficou vazia. Tente novamente')
          return
        }
        try {
          const mp3 = await encodeRecordingAsMp3(blob)
          if (mp3.size === 0) throw new Error('empty mp3')
          onDone(new File([mp3], `gravacao-${Date.now()}.mp3`, { type: 'audio/mpeg' }))
        } catch {
          const sourceExtension = mimeType.split('/')[1]?.split(';')[0] || 'webm'
          onDone(new File([blob], `gravacao-${Date.now()}.${sourceExtension}`, { type: mimeType }))
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

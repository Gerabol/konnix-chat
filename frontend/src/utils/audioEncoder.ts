import { Mp3Encoder } from '@breezystack/lamejs'

/**
 * Erro específico para gravações com duração insuficiente para envio.
 */
export class AudioTooShortError extends Error {
  constructor(message = 'Áudio muito curto para ser enviado') {
    super(message)
    this.name = 'AudioTooShortError'
  }
}

/**
 * Codifica um AudioBuffer para MP3 utilizando @breezystack/lamejs.
 */
export function encodeAudioBufferToMp3(audioBuffer: AudioBuffer, kbps = 128): Blob {
  const sampleRate = audioBuffer.sampleRate
  const channels = audioBuffer.numberOfChannels
  const length = audioBuffer.length

  // Mescla canais para mono para voz corporativa otimizada
  const firstChannel = audioBuffer.getChannelData(0)
  const secondChannel = channels > 1 ? audioBuffer.getChannelData(1) : null
  const samples = new Int16Array(length)

  for (let i = 0; i < length; i++) {
    const mixed = secondChannel ? (firstChannel[i] + secondChannel[i]) / 2 : firstChannel[i]
    // Clamping seguro entre -1.0 e 1.0
    const clamped = Math.max(-1, Math.min(1, mixed))
    samples[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }

  const encoder = new Mp3Encoder(1, sampleRate, kbps)
  const parts: Uint8Array[] = []
  const chunkSize = 1152

  for (let offset = 0; offset < samples.length; offset += chunkSize) {
    const chunk = samples.subarray(offset, Math.min(offset + chunkSize, samples.length))
    const encoded = encoder.encodeBuffer(chunk)
    if (encoded && encoded.length > 0) {
      parts.push(new Uint8Array(encoded))
    }
  }

  const flushed = encoder.flush()
  if (flushed && flushed.length > 0) {
    parts.push(new Uint8Array(flushed))
  }

  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' })
}

/**
 * Codifica um AudioBuffer para WAV PCM 16-bit com cabeçalho RIFF completo.
 * Fallback à prova de falhas com duração finita garantida em qualquer navegador.
 */
export function encodeAudioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = 1
  const sampleRate = audioBuffer.sampleRate
  const length = audioBuffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = length * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  // RIFF Chunk
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')

  // fmt subchunk
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // Bits per sample

  // data subchunk
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const firstChannel = audioBuffer.getChannelData(0)
  const secondChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null
  let offset = 44

  for (let i = 0; i < length; i++) {
    const mixed = secondChannel ? (firstChannel[i] + secondChannel[i]) / 2 : firstChannel[i]
    const clamped = Math.max(-1, Math.min(1, mixed))
    const s = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    view.setInt16(offset, s, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Decodifica o áudio capturado pelo MediaRecorder, valida duração mínima
 * e codifica para MP3 genuíno (com fallback para WAV).
 */
export async function processRecordedAudio(
  rawBlob: Blob,
  minDurationSeconds = 0.5,
): Promise<{ file: File; duration: number }> {
  if (!rawBlob || rawBlob.size === 0) {
    throw new AudioTooShortError('Gravação vazia. Tente novamente.')
  }

  const AudioContextClass =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      : (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext

  if (!AudioContextClass) {
    // Se não tiver AudioContext, devolve o blob original com nome seguro
    return {
      file: new File([rawBlob], `gravacao-${Date.now()}.mp3`, { type: 'audio/mpeg' }),
      duration: 0,
    }
  }

  const audioCtx = new AudioContextClass()
  let audioBuffer: AudioBuffer
  try {
    const arrayBuffer = await rawBlob.arrayBuffer()
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  } catch {
    // Se o decodeAudioData falhar porque o blob é muito pequeno ou corrompido
    throw new AudioTooShortError('Áudio muito curto ou inaudível. Tente novamente.')
  } finally {
    try {
      await audioCtx.close()
    } catch {
      // Ignora erro ao fechar contexto temporário
    }
  }

  const duration = audioBuffer.duration
  if (!Number.isFinite(duration) || duration < minDurationSeconds || audioBuffer.length < 800) {
    throw new AudioTooShortError('Áudio muito curto (mínimo de 0,5s).')
  }

  // Tenta codificar para MP3
  try {
    const mp3Blob = encodeAudioBufferToMp3(audioBuffer)
    if (mp3Blob.size > 0) {
      return {
        file: new File([mp3Blob], `gravacao-${Date.now()}.mp3`, { type: 'audio/mpeg' }),
        duration,
      }
    }
  } catch (err) {
    console.warn('[AudioEncoder] Falha ao codificar MP3, acionando fallback WAV:', err)
  }

  // Fallback seguro: WAV PCM 16-bit com cabeçalho RIFF garantido
  const wavBlob = encodeAudioBufferToWav(audioBuffer)
  return {
    file: new File([wavBlob], `gravacao-${Date.now()}.wav`, { type: 'audio/wav' }),
    duration,
  }
}

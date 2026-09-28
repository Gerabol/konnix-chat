import type { Message } from '../api.ts'

const SAMPLE_RATE = 44100
const DEDUP_WINDOW_MS = 1500
const COOLDOWN_MS = 350

let cachedWavUrl: string | null = null
let sharedAudioContext: AudioContext | null = null
let audioUnlocked = false
let lastPlayedAt = 0
const playedMessageIds = new Map<string, number>()

/**
 * Gera em memória um arquivo WAV PCM 16-bit (44.1kHz) contendo um chime duplo
 * cristalino e suave (notas Lá5 880Hz -> Mi6 1318.5Hz com harmônicos e envelope exponencial).
 * Usar um HTMLAudioElement com WAV em memória permite que o Chrome no macOS e Windows
 * reproduza o som mesmo quando a aba está em segundo plano (document.hidden) ou sem foco.
 */
export function buildNotificationWavBytes(): Uint8Array {
  const durationSeconds = 0.42
  const numSamples = Math.floor(SAMPLE_RATE * durationSeconds)
  const dataSize = numSamples * 2 // 16-bit mono = 2 bytes por sample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  // RIFF Header
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')

  // fmt subchunk
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // Subchunk1Size (PCM)
  view.setUint16(20, 1, true) // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true) // NumChannels (1 = mono)
  view.setUint32(24, SAMPLE_RATE, true) // SampleRate
  view.setUint32(28, SAMPLE_RATE * 2, true) // ByteRate
  view.setUint16(32, 2, true) // BlockAlign
  view.setUint16(34, 16, true) // BitsPerSample

  // data subchunk
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  // Síntese de duas notas: Nota 1 (0.00s - 0.14s: 880Hz A5), Nota 2 (0.12s - 0.42s: 1318.51Hz E6)
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE
    let sample = 0

    if (t < 0.16) {
      const env1 = Math.min(1, t / 0.008) * Math.exp(-t * 18)
      sample += env1 * (0.65 * Math.sin(2 * Math.PI * 880 * t) + 0.2 * Math.sin(2 * Math.PI * 1760 * t))
    }

    if (t >= 0.11) {
      const t2 = t - 0.11
      const env2 = Math.min(1, t2 / 0.008) * Math.exp(-t2 * 11)
      sample += env2 * (0.7 * Math.sin(2 * Math.PI * 1318.51 * t2) + 0.22 * Math.sin(2 * Math.PI * 2637.02 * t2))
    }

    const clamped = Math.max(-1, Math.min(1, sample * 0.55))
    const pcm16 = clamped < 0 ? Math.floor(clamped * 0x8000) : Math.floor(clamped * 0x7fff)
    view.setInt16(44 + i * 2, pcm16, true)
  }

  return new Uint8Array(buffer)
}

function getOrCreateWavUrl(): string | null {
  if (cachedWavUrl) return cachedWavUrl
  try {
    const wavBytes = buildNotificationWavBytes()
    const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' })
    cachedWavUrl = URL.createObjectURL(blob)
    return cachedWavUrl
  } catch {
    return null
  }
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  const win = window as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return win.AudioContext ?? win.webkitAudioContext ?? null
}

/**
 * Desbloqueia o motor de áudio do navegador durante uma interação do usuário
 * (clique, toque ou tecla) para que o Chrome no macOS/Windows permita reproduzir
 * alertas sonoros posteriormente mesmo quando a aba estiver em segundo plano.
 */
export function unlockNotificationSound(): void {
  if (audioUnlocked) return
  try {
    const Ctor = getAudioContextConstructor()
    if (Ctor) {
      if (!sharedAudioContext) {
        sharedAudioContext = new Ctor()
      }
      if (sharedAudioContext.state === 'suspended') {
        void sharedAudioContext.resume().catch(() => undefined)
      }
    }
    getOrCreateWavUrl()
    audioUnlocked = true
  } catch {
    /* ignore audio unlock errors */
  }
}

function playViaWebAudioFallback(): void {
  const Ctor = getAudioContextConstructor()
  if (!Ctor) return
  try {
    const ctx = sharedAudioContext && sharedAudioContext.state !== 'closed' ? sharedAudioContext : new Ctor()
    sharedAudioContext = ctx
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined)
    }

    const now = ctx.currentTime
    const playTone = (freq: number, startOffset: number, duration: number, peakGain: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + startOffset)
      gain.gain.setValueAtTime(0.0001, now + startOffset)
      gain.gain.linearRampToValueAtTime(peakGain, now + startOffset + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + startOffset)
      osc.stop(now + startOffset + duration + 0.02)
    }

    playTone(880, 0, 0.14, 0.22)
    playTone(1318.51, 0.11, 0.28, 0.25)
  } catch {
    /* ignore synthesis failure */
  }
}

/**
 * Reproduz o efeito sonoro de notificação com desduplicação por `messageId` e cooldown.
 * Tenta prioritariamente via HTMLAudioElement (que funciona em abas em background no Chrome macOS/Windows)
 * e aciona fallback via Web Audio API se necessário.
 */
export function playNotificationSound(messageId?: string | null): boolean {
  const now = Date.now()

  // Limpa IDs antigos do cache de desduplicação
  for (const [id, timestamp] of playedMessageIds.entries()) {
    if (now - timestamp > 30_000) {
      playedMessageIds.delete(id)
    }
  }

  if (messageId) {
    const prev = playedMessageIds.get(messageId)
    if (prev !== undefined && now - prev < DEDUP_WINDOW_MS) {
      return false
    }
    playedMessageIds.set(messageId, now)
  }

  if (now - lastPlayedAt < COOLDOWN_MS) {
    return false
  }
  lastPlayedAt = now

  try {
    if (typeof Audio !== 'undefined') {
      const wavUrl = getOrCreateWavUrl()
      if (wavUrl) {
        const audio = new Audio(wavUrl)
        audio.volume = 0.75
        const playPromise = audio.play()
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            playViaWebAudioFallback()
          })
        }
        return true
      }
    }
  } catch {
    /* fallback para Web Audio API */
  }

  playViaWebAudioFallback()
  return true
}

/**
 * Apenas para testes unitários: reseta o estado interno de cooldown e desduplicação.
 */
export function resetNotificationSoundStateForTests(): void {
  lastPlayedAt = 0
  playedMessageIds.clear()
  audioUnlocked = false
}

/**
 * Formata o texto de resumo (snippet) exibido na notificação e no toast.
 * Corrige o cenário onde o backend preenche `msg.content` com `attachment.originalName`
 * (ex: "gravacao-1727543550000.mp3") quando o usuário envia um áudio ou foto sem legenda.
 */
export function formatNotificationSnippet(
  msg: Pick<Message, 'content' | 'attachment' | 'poll'>,
): string {
  const rawContent = msg.content?.replace(/\s+/g, ' ').trim() || ''
  const attachmentName = msg.attachment?.originalName?.replace(/\s+/g, ' ').trim() || ''
  const isDefaultFilenameContent = Boolean(
    msg.attachment && (!rawContent || (attachmentName && rawContent === attachmentName)),
  )

  if (msg.attachment) {
    const mime = msg.attachment.mimeType?.toLowerCase() || ''
    const isAudio =
      mime.startsWith('audio/') ||
      /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm)$/i.test(attachmentName)
    const isImage =
      mime.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(attachmentName)

    if (isDefaultFilenameContent) {
      if (isAudio) return '🎤 Mensagem de áudio'
      if (isImage) return '📷 Enviou uma foto'
      return `📎 Arquivo: ${attachmentName || 'Anexo'}`
    }

    if (isAudio) return `🎤 ${rawContent}`
    if (isImage) return `📷 ${rawContent}`
    return `📎 ${rawContent}`
  }

  if (!rawContent && msg.poll) {
    return `📊 Enquete: ${msg.poll.question}`
  }

  return rawContent || 'Nova mensagem'
}

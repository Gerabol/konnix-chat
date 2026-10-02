export const PLAYBACK_RATES = [1, 1.5, 2] as const
export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

/**
 * Formata um tempo em segundos para a representação "m:ss" (ex: 0:05, 1:42).
 * Lida com NaN, números negativos e valores infinitos de forma segura.
 */
export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }
  const totalSeconds = Math.floor(seconds)
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Alterna ciclicamente entre as velocidades suportadas: 1x -> 1.5x -> 2x -> 1x.
 */
export function cyclePlaybackRate(currentRate: number): PlaybackRate {
  if (currentRate === 1) return 1.5
  if (currentRate === 1.5) return 2
  return 1
}

/**
 * Verifica se o conteúdo textual de uma mensagem é apenas o nome de arquivo
 * padrão gerado pelo sistema (ex: "gravacao-1727543550000.mp3" ou o nome do anexo).
 * Permite omitir esse texto técnico redundante nas bolhas de chat.
 */
export function isDefaultAttachmentContent(
  content: string | null | undefined,
  attachments?: { originalName: string }[] | null,
): boolean {
  if (!content) return false
  const trimmed = content.trim()
  if (!trimmed) return false

  // Padrão automático de áudio gravado "gravacao-<timestamp>.mp3"
  if (/^gravacao-\d+\.mp3$/i.test(trimmed)) {
    return true
  }

  // Se o conteúdo for idêntico ao nome de algum dos anexos
  if (attachments && attachments.length > 0) {
    return attachments.some((att) => att.originalName?.trim() === trimmed)
  }

  return false
}

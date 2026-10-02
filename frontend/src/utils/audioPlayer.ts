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

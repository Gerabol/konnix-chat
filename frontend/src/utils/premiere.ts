export const PREMIERE_VIDEO_ID = 'KwThw73ZjTQ'
export const PREMIERE_TIME_ZONE = 'America/Sao_Paulo'
export const PREMIERE_DATES: readonly string[] = ['2026-09-27', '2026-09-28']
export const PREMIERE_SEEN_KEY = 'konnix-premiere-watched'
export const PREMIERE_SEEK_TOLERANCE_SECONDS = 2
export const PREMIERE_MAX_POLL_GAP_MS = 3000
// Trava curta de propósito: o visitante só precisa ver a abertura do vídeo
// antes de poder entrar no Konnix. Valores longos (o padrão do AdSense é 30s+)
// atrasam o primeiro acesso e derrubam a conversão.
export const PREMIERE_ENTRY_LOCK_SECONDS = 10

export type PremiereExit = 'watched' | 'skipped' | 'failed'

// 1) Só conta como exibição se o vídeo TOCOU ou se o visitante PULOU.
//    Falha libera o acesso sem gravar nada, para tentar de novo depois.
export function shouldRememberPremiereExit(exit: PremiereExit): boolean {
  return exit !== 'failed'
}

// 2) mm:ss com dois dígitos. Math.max(0) porque o setInterval entrega fração
//    de segundo em máquina lenta e apareceria "-1" por um frame.
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// 3) Trava da timeline. A IFrame API não emite evento de seek, então a única
//    forma de detectar o arraste é comparar getCurrentTime() com o valor da
//    leitura anterior. A guarda de elapsedMs evita o falso positivo clássico:
//    aba em segundo plano é timer throttle para 1 por minuto, e o vídeo
//    "anda" muito entre duas leituras sem que ninguém tenha mexido na
//    timeline.
export function isTimelineJump(
  currentTime: number,
  lastTime: number,
  elapsedMs: number,
  primed: boolean,
): boolean {
  if (!primed) return false
  if (elapsedMs > PREMIERE_MAX_POLL_GAP_MS) return false
  return currentTime > lastTime + PREMIERE_SEEK_TOLERANCE_SECONDS
}

// 4) Data no fuso de São Paulo. Use formatToParts, NÃO toLocaleDateString:
//    o formato do retorno varia por locale e por versão de ICU do navegador.
export function premiereDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PREMIERE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function isPremiereDate(now: Date): boolean {
  return PREMIERE_DATES.includes(premiereDateKey(now))
}

function readSeenDate(): string | null {
  try {
    return localStorage.getItem(PREMIERE_SEEN_KEY)
  } catch {
    return null
  }
}

export function hasSeenPremiere(now: Date): boolean {
  return readSeenDate() === premiereDateKey(now)
}

export function markPremiereSeen(now: Date): void {
  try {
    localStorage.setItem(PREMIERE_SEEN_KEY, premiereDateKey(now))
  } catch {
    /* armazenamento indisponível */
  }
}

export function shouldShowPremiere(now: Date = new Date()): boolean {
  return isPremiereDate(now) && !hasSeenPremiere(now)
}

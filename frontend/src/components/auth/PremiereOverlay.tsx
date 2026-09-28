import { useEffect, useRef, useState } from 'react'
import {
  PREMIERE_ENTRY_LOCK_SECONDS,
  PREMIERE_VIDEO_ID,
  formatCountdown,
  isTimelineJump,
  type PremiereExit,
} from '../../utils/premiere'

const API_SRC = 'https://www.youtube.com/iframe_api'
const EMBED_HOST = 'https://www.youtube-nocookie.com'
const START_TIMEOUT_MS = 12_000
const HARD_CAP_MS = 15 * 60_000
const SEEK_POLL_MS = 1000
const EMBED_ORIGIN = typeof window === 'undefined' ? '' : window.location.origin

interface YoutubePlayer {
  playVideo: () => void
  unMute: () => void
  setVolume: (volume: number) => void
  getCurrentTime: () => number
  seekTo: (seconds: number) => void
  destroy: () => void
}

declare global {
  interface Window {
    YT?: { Player: new (host: HTMLElement, options: Record<string, unknown>) => YoutubePlayer }
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<void> | null = null

function loadIframeApi(): Promise<void> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise<void>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve()
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = API_SRC
    script.async = true
    script.onerror = () => reject(new Error('iframe_api_unavailable'))
    document.head.appendChild(script)
  })
  return apiPromise
}

interface PremiereOverlayProps {
  onDismiss: (exit: PremiereExit) => void
}

export function PremiereOverlay({ onDismiss }: PremiereOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const skipRef = useRef<HTMLButtonElement>(null)
  const playerRef = useRef<YoutubePlayer | null>(null)
  const dismissedRef = useRef(false)
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hardCapRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [remaining, setRemaining] = useState(PREMIERE_ENTRY_LOCK_SECONDS)
  const remainingRef = useRef(remaining)
  remainingRef.current = remaining

  const dismissOnce = (exit: PremiereExit) => {
    if (dismissedRef.current) return
    dismissedRef.current = true
    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current)
    if (hardCapRef.current) clearTimeout(hardCapRef.current)
    try {
      playerRef.current?.destroy()
    } catch {
      /* best-effort */
    }
    onDismiss(exit)
  }

  // Foco inicial no dialog para o leitor de tela anunciar o contexto
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  // Montagem do player
  useEffect(() => {
    let cancelled = false
    let host: HTMLDivElement | null = null

    const failOpen = () => {
      if (cancelled || dismissedRef.current) return
      console.warn('[premiere] player indisponível, liberando o acesso')
      dismissOnce('failed')
    }

    const startTimeout = setTimeout(() => {
      if (!playing) failOpen()
    }, START_TIMEOUT_MS)
    startTimeoutRef.current = startTimeout

    const hardCap = setTimeout(() => {
      if (!dismissedRef.current) dismissOnce('failed')
    }, HARD_CAP_MS)
    hardCapRef.current = hardCap

    void loadIframeApi()
      .then(() => {
        if (cancelled || dismissedRef.current) return
        const container = containerRef.current
        if (!container) return

        host = document.createElement('div')
        host.className = 'premiere-video'
        container.appendChild(host)

        playerRef.current = new window.YT!.Player(host, {
          videoId: PREMIERE_VIDEO_ID,
          host: EMBED_HOST,
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            iv_load_policy: 3,
            cc_load_policy: 1,
            fs: 0,
            origin: EMBED_ORIGIN,
          },
          events: {
            onReady: () => {
              playerRef.current?.playVideo()
            },
            onStateChange: (event: { data: number }) => {
              if (event.data === 1) {
                // PLAYING
                if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current)
                setPlaying(true)
              }
              if (event.data === 0) dismissOnce('watched') // ENDED
            },
            onError: failOpen,
          },
        })
      })
      .catch(() => {
        if (!cancelled && !dismissedRef.current) {
          console.warn('[premiere] player indisponível, liberando o acesso')
          dismissOnce('failed')
        }
      })

    return () => {
      cancelled = true
      if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current)
      if (hardCapRef.current) clearTimeout(hardCapRef.current)
      try {
        playerRef.current?.destroy()
      } catch {
        /* best-effort */
      }
      playerRef.current = null
      host?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Contador regressivo — começa só quando playing vira true
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [playing])

  // Move o foco para o botão quando remaining chega a 0
  useEffect(() => {
    if (remaining === 0) {
      skipRef.current?.focus()
    }
  }, [remaining])

  // Trava da timeline — detecta arraste e tecla de avanço.
  // Só vale enquanto o botão "Entrar no Konnix" está bloqueado; depois da
  // liberação o espectador fica livre para navegar no vídeo como quiser.
  // O estado vai por ref para o polling não ser reconstruído a cada segundo
  // do contador, o que zeraria a linha de base do arraste.
  useEffect(() => {
    if (!playing) return
    let lastTime = 0
    let lastTick = Date.now()
    let primed = false
    const timer = setInterval(() => {
      const player = playerRef.current
      if (!player || remainingRef.current === 0) return
      const now = Date.now()
      const current = player.getCurrentTime()
      if (isTimelineJump(current, lastTime, now - lastTick, primed)) {
        player.seekTo(lastTime)
        return
      }
      primed = true
      lastTime = current
      lastTick = now
    }, SEEK_POLL_MS)
    return () => clearInterval(timer)
  }, [playing])

  const enableSound = () => {
    try {
      playerRef.current?.unMute()
      playerRef.current?.setVolume(100)
      setMuted(false)
    } catch {
      /* best-effort */
    }
  }

  const skip = () => {
    dismissOnce('skipped')
  }

  return (
    <div
      className="premiere-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Apresentação de estreia do Konnix Chat"
      tabIndex={-1}
      ref={dialogRef}
    >
      <p className="premiere-kicker">Apresentação de estreia</p>
      <div className="premiere-frame" ref={containerRef} />
      <div className="premiere-actions">
        <button
          ref={skipRef}
          type="button"
          className="premiere-skip"
          onClick={skip}
          disabled={remaining > 0}
        >
          {remaining > 0 ? `Entrar em ${formatCountdown(remaining)}` : 'Entrar no Konnix'}
        </button>
        {playing && muted && (
          <button type="button" className="premiere-sound" onClick={enableSound}>
            Ativar som
          </button>
        )}
      </div>
      <p className="premiere-note">
        {!playing
          ? 'Carregando a apresentação…'
          : remaining > 0
            ? muted
              ? 'O vídeo começa sem som por política do navegador. Use "Ativar som" para ouvir.'
              : `Você já pode entrar no Konnix em ${formatCountdown(remaining)}.`
            : 'Entrada liberada. Clique em "Entrar no Konnix" ou continue assistindo.'}
      </p>
    </div>
  )
}

export default PremiereOverlay

import { useCallback, useEffect, useRef, useState } from 'react'
import { transcriptionService } from '../../services/transcriptionService'
import { cyclePlaybackRate, formatAudioTime } from '../../utils/audioPlayer'
import type { PlaybackRate } from '../../utils/audioPlayer'
import { copyText } from '../../utils/clipboard'
import { AvatarImage, initials } from './AvatarImage'

export interface AudioPlayerProps {
  src: string
  authorName: string
  authorAvatarPath: string | null
  fileName?: string
}

type TranscribeState = 'idle' | 'loading' | 'done' | 'error'

export function AudioPlayer({
  src,
  authorName,
  authorAvatarPath,
  fileName = 'audio.mp3',
}: AudioPlayerProps) {
  const playerIdRef = useRef<string>(Math.random().toString(36).slice(2, 9))
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1)
  const [isSeeking, setIsSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)

  // Estados da transcrição no cliente
  const [transcription, setTranscription] = useState<string | null>(() => {
    return transcriptionService.getCachedTranscription(src) || null
  })
  const [transcribeState, setTranscribeState] = useState<TranscribeState>(() => {
    return transcriptionService.getCachedTranscription(src) ? 'done' : 'idle'
  })
  const [statusMessage, setStatusMessage] = useState('')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [hasCopied, setHasCopied] = useState(false)

  // Reseta os estados quando o src do áudio muda
  useEffect(() => {
    setCurrentTime(0)
    setIsPlaying(false)
    setDuration(0)
    const cached = transcriptionService.getCachedTranscription(src)
    if (cached !== undefined) {
      setTranscription(cached)
      setTranscribeState('done')
    } else {
      setTranscription(null)
      setTranscribeState('idle')
    }
    setStatusMessage('')
    setIsCollapsed(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [src])

  // Pausa o áudio ao desmontar o componente para evitar áudios órfãos
  useEffect(() => {
    const audio = audioRef.current
    return () => {
      if (audio && !audio.paused) {
        audio.pause()
      }
    }
  }, [])

  // Garante reprodução exclusiva (ao tocar este áudio, pausa outros áudios ativos)
  useEffect(() => {
    const onAnyAudioPlay = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>
      if (customEvent.detail?.id !== playerIdRef.current && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause()
      }
    }
    window.addEventListener('konnix:audio-play', onAnyAudioPlay)
    return () => window.removeEventListener('konnix:audio-play', onAnyAudioPlay)
  }, [])

  // Sincroniza a taxa de reprodução
  const handleSpeedCycle = useCallback(() => {
    const nextRate = cyclePlaybackRate(playbackRate)
    setPlaybackRate(nextRate)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate
    }
  }, [playbackRate])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) {
      audio.playbackRate = playbackRate
      audio.play().catch(() => {
        setIsPlaying(false)
      })
    } else {
      audio.pause()
    }
  }, [playbackRate])

  // Dispara a transcrição usando Whisper via Web Worker no cliente
  const handleTranscribe = useCallback(async () => {
    setTranscribeState('loading')
    setStatusMessage('Preparando áudio...')
    try {
      const text = await transcriptionService.transcribeAudio(src, (msg) => {
        setStatusMessage(msg)
      })
      setTranscription(text)
      setTranscribeState('done')
      setIsCollapsed(false)
    } catch (err: unknown) {
      console.error('[AudioPlayer] Falha na transcrição:', err)
      setTranscribeState('error')
      const msg = err instanceof Error ? err.message : 'Falha ao transcrever áudio'
      setStatusMessage(msg)
    }
  }, [src])

  const handleCopy = useCallback(async () => {
    if (!transcription) return
    const ok = await copyText(transcription)
    if (ok) {
      setHasCopied(true)
      setTimeout(() => setHasCopied(false), 2000)
    }
  }, [transcription])

  const handleSeekStart = () => {
    setIsSeeking(true)
    setSeekValue(currentTime)
  }

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setSeekValue(val)
  }

  const handleSeekCommit = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement
    const newTime = parseFloat(target.value)
    setIsSeeking(false)
    setCurrentTime(newTime)
    if (audioRef.current && Number.isFinite(newTime)) {
      audioRef.current.currentTime = newTime
    }
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
      audio.playbackRate = playbackRate
    }

    const handleTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(audio.currentTime)
      }
    }

    const handlePlay = () => {
      setIsPlaying(true)
      audio.playbackRate = playbackRate
      window.dispatchEvent(
        new CustomEvent('konnix:audio-play', { detail: { id: playerIdRef.current } }),
      )
    }

    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('durationchange', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('durationchange', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [isSeeking, playbackRate])

  // Porcentagem calculada para preencher a trilha visual do scrubber
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const effectiveTime = isSeeking ? seekValue : currentTime
  const progressPercent = safeDuration > 0 ? Math.min(100, Math.max(0, (effectiveTime / safeDuration) * 100)) : 0

  return (
    <div className={`attachment-audio ${isPlaying ? 'playing' : ''}`}>
      {/* Elemento de áudio invisível para controle completo via API nativa */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Linha principal com controles do player */}
      <div className="audio-player-main">
        {/* Avatar do autor */}
        <div className="audio-player-avatar-wrap">
          <AvatarImage
            path={authorAvatarPath}
            className="audio-player-avatar"
            fallback={<span className="audio-player-avatar fallback">{initials(authorName || 'sistema')}</span>}
            alt={authorName}
          />
        </div>

        {/* Botão Play / Pause circular */}
        <button
          type="button"
          className="audio-player-play-btn"
          onClick={togglePlay}
          title={isPlaying ? 'Pausar' : 'Reproduzir'}
          aria-label={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
        >
          {isPlaying ? (
            <svg className="audio-player-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1.5" />
              <rect x="14" y="5" width="4" height="14" rx="1.5" />
            </svg>
          ) : (
            <svg className="audio-player-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M8 5.14v13.72a1 1 0 0 0 1.55.83l11-6.86a1 1 0 0 0 0-1.66l-11-6.86A1 1 0 0 0 8 5.14z" />
            </svg>
          )}
        </button>

        {/* Seção central da trilha e metadados */}
        <div className="audio-player-body">
          <div className="audio-player-scrubber-wrap">
            <input
              type="range"
              className="audio-player-scrubber"
              min="0"
              max={safeDuration > 0 ? safeDuration : 100}
              step="0.05"
              value={effectiveTime}
              style={{ '--audio-progress': `${progressPercent}%` } as React.CSSProperties}
              onPointerDown={handleSeekStart}
              onTouchStart={handleSeekStart}
              onChange={handleSeekChange}
              onPointerUp={handleSeekCommit}
              onTouchEnd={handleSeekCommit}
              onKeyUp={handleSeekCommit}
              aria-label="Barra de progresso do áudio"
              aria-valuemin={0}
              aria-valuemax={safeDuration}
              aria-valuenow={effectiveTime}
              aria-valuetext={`${formatAudioTime(effectiveTime)} de ${formatAudioTime(safeDuration)}`}
            />
          </div>

          <div className="audio-player-meta">
            <span className="audio-player-time">
              {formatAudioTime(effectiveTime)} / {formatAudioTime(duration)}
            </span>
            <div className="audio-player-actions">
              {transcribeState === 'idle' && (
                <>
                  <button
                    type="button"
                    className="audio-player-action-btn btn-link"
                    onClick={handleTranscribe}
                    title="Transcrever áudio no navegador com IA Whisper"
                  >
                    Transcrever
                  </button>
                  <span className="audio-player-action-dot" aria-hidden="true">·</span>
                </>
              )}
              <a
                href={src}
                download={fileName}
                className="audio-player-download btn-link"
                title="Baixar áudio"
              >
                Baixar
              </a>
            </div>
          </div>
        </div>

        {/* Botão de velocidade dedicado */}
        <button
          type="button"
          className="audio-player-speed-btn"
          onClick={handleSpeedCycle}
          title="Alternar velocidade do áudio"
          aria-label={`Velocidade ${playbackRate}x. Clique para alternar para ${cyclePlaybackRate(playbackRate)}x`}
        >
          {playbackRate}x
        </button>
      </div>

      {/* Estado de carregamento da transcrição */}
      {transcribeState === 'loading' && (
        <div className="audio-transcription-status" role="status" aria-live="polite">
          <span className="audio-transcription-spinner" aria-hidden="true" />
          <span className="audio-transcription-status-text">{statusMessage || 'Transcrevendo áudio...'}</span>
        </div>
      )}

      {/* Estado de erro com opção de tentar novamente */}
      {transcribeState === 'error' && (
        <div className="audio-transcription-error">
          <span className="audio-transcription-error-text">Não foi possível transcrever o áudio.</span>
          <button
            type="button"
            className="audio-transcription-retry-btn btn-link"
            onClick={handleTranscribe}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Caixa com o texto da transcrição */}
      {transcribeState === 'done' && (
        <div className="audio-transcription-box">
          <div className="audio-transcription-header">
            <div className="audio-transcription-title-wrap">
              <svg className="audio-transcription-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M19 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h4l3 3 3-3h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H7v-2h10v2zm0-3H7V9h10v2zm0-3H7V6h10v2z" />
              </svg>
              <span className="audio-transcription-title">Transcrição</span>
            </div>
            <div className="audio-transcription-actions">
              {transcription && (
                <button
                  type="button"
                  className="audio-transcription-action-btn btn-link"
                  onClick={handleCopy}
                  title="Copiar texto transcrito"
                >
                  {hasCopied ? 'Copiado!' : 'Copiar'}
                </button>
              )}
              <button
                type="button"
                className="audio-transcription-action-btn btn-link"
                onClick={() => setIsCollapsed(!isCollapsed)}
                title={isCollapsed ? 'Mostrar transcrição' : 'Ocultar transcrição'}
              >
                {isCollapsed ? 'Mostrar' : 'Ocultar'}
              </button>
            </div>
          </div>
          {!isCollapsed && (
            <div className="audio-transcription-content">
              {transcription ? (
                <p className="audio-transcription-text">{transcription}</p>
              ) : (
                <p className="audio-transcription-text-empty">(Nenhuma fala identificada no áudio)</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

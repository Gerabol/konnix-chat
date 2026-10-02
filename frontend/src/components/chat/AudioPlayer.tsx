import { useCallback, useEffect, useRef, useState } from 'react'
import { cyclePlaybackRate, formatAudioTime } from '../../utils/audioPlayer'
import type { PlaybackRate } from '../../utils/audioPlayer'
import { AvatarImage, initials } from './AvatarImage'

export interface AudioPlayerProps {
  src: string
  authorName: string
  authorAvatarPath: string | null
  fileName?: string
}

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

  // Reseta os estados quando o src do áudio muda
  useEffect(() => {
    setCurrentTime(0)
    setIsPlaying(false)
    setDuration(0)
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

      {/* Botão de velocidade dedicado (substituindo o antigo menu ...) */}
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
  )
}

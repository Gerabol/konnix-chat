import { useCallback, useEffect, useRef, useState } from 'react'
import { formatBytes } from '../../api'
import { cyclePlaybackRate, formatAudioTime } from '../../utils/audioPlayer'
import type { PlaybackRate } from '../../utils/audioPlayer'
import { AvatarImage, initials } from './AvatarImage'

export interface AudioPlayerProps {
  src: string
  authorName: string
  authorAvatarPath: string | null
  fileSize?: number
  fileName?: string
}

export function AudioPlayer({
  src,
  authorName,
  authorAvatarPath,
  fileSize,
  fileName = 'audio.mp3',
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1)
  const [isSeeking, setIsSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)

  // Sincroniza a taxa de reprodução se mudar
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
      audio.play().catch(() => {
        setIsPlaying(false)
      })
    } else {
      audio.pause()
    }
  }, [])

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
    }

    const handleTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(audio.currentTime)
      }
    }

    const handlePlay = () => setIsPlaying(true)
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
  }, [isSeeking])

  // Porcentagem calculada para preencher a trilha visual do scrubber
  const effectiveTime = isSeeking ? seekValue : currentTime
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (effectiveTime / duration) * 100)) : 0

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

      {/* Avatar do autor com sobreposição de velocidade quando tocando */}
      <div className="audio-player-avatar-wrap">
        <AvatarImage
          path={authorAvatarPath}
          className="audio-player-avatar"
          fallback={<span className="audio-player-avatar fallback">{initials(authorName || 'sistema')}</span>}
          alt={authorName}
        />
        {/* Badge sobreposto exibido quando o áudio está em reprodução ou pausado após início */}
        {(isPlaying || currentTime > 0) && (
          <button
            type="button"
            className="audio-speed-overlay"
            onClick={handleSpeedCycle}
            title={`Velocidade ${playbackRate}x (clique para alterar)`}
            aria-label={`Velocidade ${playbackRate}x. Clique para alternar para ${cyclePlaybackRate(playbackRate)}x`}
          >
            {playbackRate}x
          </button>
        )}
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
            max={duration > 0 ? duration : 100}
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
            aria-valuemax={duration}
            aria-valuenow={effectiveTime}
            aria-valuetext={`${formatAudioTime(effectiveTime)} de ${formatAudioTime(duration)}`}
          />
        </div>

        <div className="audio-player-meta">
          <span className="audio-player-time">
            {formatAudioTime(effectiveTime)} / {formatAudioTime(duration)}
          </span>
          {typeof fileSize === 'number' && fileSize > 0 && (
            <span className="audio-player-size">{formatBytes(fileSize)}</span>
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

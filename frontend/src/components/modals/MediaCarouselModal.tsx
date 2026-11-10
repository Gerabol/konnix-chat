import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api, ApiError, formatBytes } from '../../api'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import { saveDownloadedBlob } from '../../platform'
import { attachmentBlobCache } from '../../utils/attachmentCache'
import type { MediaItem } from '../../utils/mediaCarousel'
import { getNextMediaIndex, getPrevMediaIndex, getVisibleMediaIndices } from '../../utils/mediaCarousel'
import { IconChevronLeft, IconChevronRight, IconDownload } from '../icons'
import { ZoomableImage } from './ZoomableImage'
import type { ZoomableImageHandle } from './ZoomableImage'

function formatMediaDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function ThumbnailItem({ item, isActive }: { item: MediaItem; isActive: boolean }) {
  const cached = attachmentBlobCache.get(item.id)
  const [url, setUrl] = useState<string | null>(cached ?? null)

  useEffect(() => {
    const cachedUrl = attachmentBlobCache.get(item.id)
    if (cachedUrl) {
      setUrl(cachedUrl)
      return
    }
    let active = true
    api.downloadFile(item.id)
      .then((blob) => {
        if (!active) return
        const existing = attachmentBlobCache.get(item.id)
        if (existing) {
          setUrl(existing)
          return
        }
        const objectUrl = URL.createObjectURL(blob)
        attachmentBlobCache.set(item.id, objectUrl)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (active) setUrl(null)
      })
    return () => {
      active = false
    }
  }, [item.id])

  if (!url) {
    return (
      <div className={`media-carousel-thumb-loading ${isActive ? 'active' : ''}`}>
        <span>{item.type === 'video' ? '🎬' : '🖼'}</span>
      </div>
    )
  }

  if (item.type === 'video') {
    return (
      <div className="media-carousel-thumb-inner">
        <video
          src={`${url}#t=0.1`}
          className="media-carousel-thumb-video"
          preload="metadata"
          muted
          playsInline
        />
        <span className="media-carousel-thumb-badge" aria-hidden="true">
          ▶
        </span>
      </div>
    )
  }

  return (
    <div className="media-carousel-thumb-inner">
      <img src={url} alt={item.originalName} className="media-carousel-thumb-img" />
    </div>
  )
}

export function MediaCarouselModal({
  items,
  initialMediaId,
  onClose,
}: {
  items: MediaItem[]
  initialMediaId: string
  onClose: () => void
}) {
  const initialIndex = Math.max(
    0,
    items.findIndex((item) => item.id === initialMediaId),
  )
  const [currentMediaId, setCurrentMediaId] = useState(items[initialIndex]?.id ?? initialMediaId)
  const selectedIndex = items.findIndex((item) => item.id === currentMediaId)
  const currentIndex = selectedIndex >= 0 ? selectedIndex : Math.min(initialIndex, items.length - 1)
  const [hasNavigated, setHasNavigated] = useState(false)
  const isInitialDirectVideo = useRef(
    items[initialIndex]?.type === 'video' && items[initialIndex]?.id === initialMediaId,
  )

  const currentItem = items[currentIndex] ?? null
  const shouldAutoPlay = isInitialDirectVideo.current && !hasNavigated && currentItem?.id === initialMediaId

  const zoomRef = useRef<ZoomableImageHandle>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const activeThumbRef = useRef<HTMLButtonElement>(null)
  const thumbStripRef = useRef<HTMLDivElement>(null)

  const [mediaUrl, setMediaUrl] = useState<string | null>(
    currentItem ? attachmentBlobCache.get(currentItem.id) ?? null : null,
  )
  const [loading, setLoading] = useState<boolean>(!mediaUrl)
  const [error, setError] = useState<string | null>(null)
  const [displayedMediaId, setDisplayedMediaId] = useState<string | null>(null)
  const [readyMediaId, setReadyMediaId] = useState<string | null>(null)
  const [loadedMediaId, setLoadedMediaId] = useState<string | null>(currentItem && mediaUrl ? currentItem.id : null)
  const [isOverflowing, setIsOverflowing] = useState(items.length > 4)

  useEscapeClose(onClose)

  // Aguarda a pintura da mídia principal antes de iniciar downloads das miniaturas.
  useEffect(() => {
    if (!currentItem || readyMediaId !== currentItem.id) return
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setDisplayedMediaId(currentItem.id))
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [currentItem?.id, readyMediaId])

  // Se a lista de mídias for esvaziada (todas as fotos foram apagadas), fecha o modal
  useEffect(() => {
    if (items.length === 0) {
      onClose()
      return
    }
    if (selectedIndex < 0) setCurrentMediaId(items[currentIndex].id)
  }, [items, onClose, selectedIndex, currentIndex])

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // Medição da trilha de miniaturas para centralização exata no iOS WebKit
  useLayoutEffect(() => {
    const strip = thumbStripRef.current
    if (!strip) return
    const check = () => {
      setIsOverflowing(strip.scrollWidth > strip.clientWidth + 2)
    }
    check()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    observer?.observe(strip)
    return () => observer?.disconnect()
  }, [items.length, currentIndex])

  // Auto-scroll da miniatura ativa na barra inferior
  useEffect(() => {
    if (activeThumbRef.current) {
      activeThumbRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [currentIndex])

  // Carrega ou busca blob da mídia ativa
  useEffect(() => {
    if (!currentItem) return

    const cached = attachmentBlobCache.get(currentItem.id)
    if (cached) {
      setMediaUrl(cached)
      setLoadedMediaId(currentItem.id)
      setLoading(false)
      setError(null)
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    api.downloadFile(currentItem.id)
      .then((blob) => {
        if (!active) return
        let url = attachmentBlobCache.get(currentItem.id)
        if (!url) {
          url = URL.createObjectURL(blob)
          attachmentBlobCache.set(currentItem.id, url)
        }
        setMediaUrl(url)
        setLoadedMediaId(currentItem.id)
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar a mídia')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [currentItem])

  // Pausa o vídeo anterior quando o item muda
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause()
      }
    }
  }, [currentIndex])

  const handlePrev = useCallback(() => {
    if (currentIndex <= 0) return
    if (videoRef.current) videoRef.current.pause()
    setHasNavigated(true)
    setDisplayedMediaId(null)
    setReadyMediaId(null)
    setCurrentMediaId(items[getPrevMediaIndex(currentIndex)].id)
  }, [items, currentIndex])

  const handleNext = useCallback(() => {
    if (currentIndex < 0 || currentIndex >= items.length - 1) return
    if (videoRef.current) videoRef.current.pause()
    setHasNavigated(true)
    setDisplayedMediaId(null)
    setReadyMediaId(null)
    setCurrentMediaId(items[getNextMediaIndex(currentIndex, items.length)].id)
  }, [items, currentIndex])

  // Teclado: Setas <- e -> para navegar, Esc para fechar, + e - para zoom
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        handlePrev()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        handleNext()
        return
      }

      if (currentItem?.type === 'image') {
        if (event.key === '+' || event.key === '=') {
          event.preventDefault()
          zoomRef.current?.zoomIn()
          return
        }
        if (event.key === '-' || event.key === '_') {
          event.preventDefault()
          zoomRef.current?.zoomOut()
          return
        }
        if (event.key === '0') {
          event.preventDefault()
          zoomRef.current?.reset()
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentItem, handleNext, handlePrev])

  const handleDownload = async () => {
    if (!currentItem) return
    try {
      const blob = await api.downloadFile(currentItem.id)
      if (await saveDownloadedBlob(blob, currentItem.originalName)) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = currentItem.originalName
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      // Ignora erro de download
    }
  }

  const onBackdropPointerDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (
      target === event.currentTarget ||
      (target instanceof HTMLElement && target.classList.contains('media-carousel-stage'))
    ) {
      onClose()
    }
  }

  if (!currentItem) return null

  const isFirst = currentIndex === 0
  const isLast = currentIndex === items.length - 1

  return (
    <div
      className="modal-overlay media-carousel-overlay"
      onMouseDown={onBackdropPointerDown}
      role="dialog"
      aria-modal="true"
      aria-label={`Visualização de mídia: ${currentItem.originalName}`}
    >
      <div className="media-carousel-container">
        {/* Barra superior de informações e ações */}
        <header className="media-carousel-header">
          <div className="media-carousel-header-left">
            <span className="media-carousel-counter">
              {currentIndex + 1} de {items.length}
            </span>
            <div className="media-carousel-details">
              <strong className="media-carousel-filename" title={currentItem.originalName}>
                {currentItem.originalName}
              </strong>
              <small className="media-carousel-meta">
                {currentItem.username && <span>@{currentItem.username}</span>}
                {currentItem.createdAt && <span>• {formatMediaDate(currentItem.createdAt)}</span>}
                <span>• {formatBytes(currentItem.size)}</span>
              </small>
            </div>
          </div>

          <div className="media-carousel-header-right">
            <button
              type="button"
              className="media-carousel-action-btn"
              onClick={handleDownload}
              title={`Baixar ${currentItem.originalName}`}
              aria-label={`Baixar arquivo ${currentItem.originalName}`}
            >
              <IconDownload size={18} />
            </button>
            <button
              ref={closeRef}
              type="button"
              className="media-carousel-action-btn media-carousel-close-btn"
              onClick={onClose}
              title="Fechar (Esc)"
              aria-label="Fechar visualizador de mídia"
            >
              ×
            </button>
          </div>
        </header>

        {/* Palco central com a mídia e botões laterais de navegação */}
        <div className="media-carousel-body">
          {items.length > 1 && (
            <button
              type="button"
              className="media-carousel-nav-btn prev"
              onClick={handlePrev}
              disabled={isFirst}
              title="Mídia anterior (Seta esquerda)"
              aria-label="Mídia anterior"
            >
              <IconChevronLeft size={28} />
            </button>
          )}

          {!loading && !error && mediaUrl && loadedMediaId === currentItem.id && currentItem.type === 'image' ? (
            <ZoomableImage
              key={currentItem.id}
              ref={zoomRef}
              src={mediaUrl}
              alt={currentItem.originalName}
              stageClassName="media-carousel-stage"
              imageClassName="media-carousel-img"
              onImageLoad={() => setReadyMediaId(currentItem.id)}
            />
          ) : (
            <div className="media-carousel-stage">
              {(loading || loadedMediaId !== currentItem.id) && !error && (
                <div className="media-carousel-loading">
                  <span className="media-carousel-spinner" aria-hidden="true" />
                  <p>Carregando {currentItem.type === 'video' ? 'vídeo' : 'imagem'}…</p>
                </div>
              )}

              {error && (
                <div className="media-carousel-error">
                  <p>⚠ {error}</p>
                  <button
                    type="button"
                    className="kx-button kx-button-secondary"
                    onClick={() => {
                      setLoading(true)
                      setError(null)
                      api.downloadFile(currentItem.id)
                        .then((blob) => {
                          const url = URL.createObjectURL(blob)
                          attachmentBlobCache.set(currentItem.id, url)
                          setMediaUrl(url)
                          setLoadedMediaId(currentItem.id)
                          setLoading(false)
                        })
                        .catch(() => {
                          setError('Falha ao tentar carregar novamente')
                          setLoading(false)
                        })
                    }}
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {!loading && !error && mediaUrl && loadedMediaId === currentItem.id && currentItem.type === 'video' && (
                <div className="media-carousel-video-wrapper">
                  <video
                    ref={videoRef}
                    key={currentItem.id}
                    src={mediaUrl}
                    controls
                    autoPlay={shouldAutoPlay}
                    preload="metadata"
                    playsInline
                    className="media-carousel-video"
                    onLoadedData={() => setReadyMediaId(currentItem.id)}
                  />
                </div>
              )}
            </div>
          )}

          {items.length > 1 && (
            <button
              type="button"
              className="media-carousel-nav-btn next"
              onClick={handleNext}
              disabled={isLast}
              title="Próxima mídia (Seta direita)"
              aria-label="Próxima mídia"
            >
              <IconChevronRight size={28} />
            </button>
          )}
        </div>

        {/* Faixa inferior de miniaturas com primeiro frame e auto-scroll */}
        {items.length > 1 && (
          <footer className="media-carousel-footer">
            <div
              className={`media-carousel-thumb-strip ${isOverflowing ? 'is-overflowing' : 'is-centered'}`}
              ref={thumbStripRef}
            >
              <div className="media-carousel-thumb-track">
                {getVisibleMediaIndices(currentIndex, items.length).map((index) => {
                  const item = items[index]
                  const isActive = index === currentIndex
                  return (
                    <button
                      key={item.id}
                      ref={isActive ? activeThumbRef : null}
                      type="button"
                      className={`media-carousel-thumb ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        if (videoRef.current) videoRef.current.pause()
                        setHasNavigated(true)
                        if (!isActive) {
                          setDisplayedMediaId(null)
                          setReadyMediaId(null)
                          setCurrentMediaId(item.id)
                        }
                      }}
                      title={`${item.originalName} (${item.type === 'video' ? 'Vídeo' : 'Imagem'})`}
                      aria-label={`Visualizar ${item.originalName}`}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      {displayedMediaId === currentItem.id ? (
                        <ThumbnailItem item={item} isActive={isActive} />
                      ) : (
                        <div className={`media-carousel-thumb-loading ${isActive ? 'active' : ''}`}>
                          <span>{item.type === 'video' ? '🎬' : '🖼'}</span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}

export default MediaCarouselModal

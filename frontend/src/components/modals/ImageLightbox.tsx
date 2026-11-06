import { useEffect, useRef, useState } from 'react'

import { useEscapeClose } from '../../hooks/useEscapeClose'
import { MAX_ZOOM_SCALE, MIN_ZOOM_SCALE, scalePercent } from '../../utils/imageZoom'
import { ZoomableImage } from './ZoomableImage'
import type { ZoomableImageHandle } from './ZoomableImage'

/**
 * Full screen image viewer used by chat attachments.
 *
 * The image is fitted to the stage and can be zoomed with the −/+ buttons,
 * keyboard, mouse wheel or touch gestures. Opening happens in place so the PWA
 * never hands the file over to the browser tab.
 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const zoomRef = useRef<ZoomableImageHandle>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [scale, setScale] = useState(1)

  useEscapeClose(onClose)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return
      }
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
      if (event.key === 'ArrowLeft') zoomRef.current?.panBy(-64, 0)
      else if (event.key === 'ArrowRight') zoomRef.current?.panBy(64, 0)
      else if (event.key === 'ArrowUp') zoomRef.current?.panBy(0, -64)
      else if (event.key === 'ArrowDown') zoomRef.current?.panBy(0, 64)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const onBackdropPointerDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (target === event.currentTarget || (target instanceof HTMLElement && target.classList.contains('lightbox-stage'))) {
      onClose()
    }
  }

  return (
    <div className="modal-overlay lightbox-overlay" onMouseDown={onBackdropPointerDown}>
      <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt}>
        <button
          ref={closeRef}
          type="button"
          className="lightbox-close"
          onClick={onClose}
          aria-label="Fechar visualização da imagem"
          title="Fechar (Esc)"
        >
          ×
        </button>

        <ZoomableImage
          ref={zoomRef}
          src={src}
          alt={alt}
          stageClassName="lightbox-stage"
          imageClassName="lightbox-img"
          onScaleChange={setScale}
        />

        <div className="lightbox-zoom" role="group" aria-label="Zoom da imagem">
          <button
            type="button"
            className="lightbox-zoom-btn"
            onClick={() => zoomRef.current?.zoomOut()}
            disabled={scale <= MIN_ZOOM_SCALE + 0.001}
            aria-label="Reduzir zoom"
            title="Reduzir zoom (−)"
          >
            −
          </button>
          <span className="lightbox-zoom-level" aria-live="polite">
            {scalePercent(scale)}%
          </span>
          <button
            type="button"
            className="lightbox-zoom-btn"
            onClick={() => zoomRef.current?.zoomIn()}
            disabled={scale >= MAX_ZOOM_SCALE - 0.001}
            aria-label="Aumentar zoom"
            title="Aumentar zoom (+)"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImageLightbox

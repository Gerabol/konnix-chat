import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useEscapeClose } from '../../hooks/useEscapeClose'
import {
  FIT_ZOOM_INDEX,
  canZoomIn,
  canZoomOut,
  clampZoomIndex,
  displaySize,
  toggleZoom,
  zoomIn,
  zoomOut,
  zoomPercent,
} from '../../utils/imageZoom'

type Box = { width: number; height: number }

/** Inner (content) box of the scrollable stage, ignoring its padding. */
function stageContentBox(el: HTMLElement): Box {
  const style = window.getComputedStyle(el)
  const px = (value: string) => (Number.parseFloat(value) || 0)
  return {
    width: el.clientWidth - px(style.paddingLeft) - px(style.paddingRight),
    height: el.clientHeight - px(style.paddingTop) - px(style.paddingBottom),
  }
}

/**
 * Full screen image viewer used by chat attachments.
 *
 * The image is always kept inside the visible area (never smaller than the
 * stage), zooming is driven by the − and + buttons and the image can be
 * scrolled around while zoomed in. Opening happens in place so the PWA never
 * hands the file over to the browser tab.
 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [natural, setNatural] = useState<Box | null>(null)
  const [stage, setStage] = useState<Box | null>(null)
  const [zoomIndex, setZoomIndex] = useState(FIT_ZOOM_INDEX)

  useEscapeClose(onClose)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setStage(stageContentBox(el))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const size = natural && stage ? displaySize(natural.width, natural.height, stage.width, stage.height, zoomIndex) : null

  // Re-centre the image on every zoom change so the user never lands on an edge.
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2)
    el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2)
  }, [zoomIndex, size?.width, size?.height])

  const setZoom = useCallback((next: number) => setZoomIndex(clampZoomIndex(next)), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        setZoom(zoomIn(zoomIndex))
        return
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        setZoom(zoomOut(zoomIndex))
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        setZoom(FIT_ZOOM_INDEX)
        return
      }
      const el = stageRef.current
      if (!el) return
      if (event.key === 'ArrowLeft') el.scrollLeft -= 64
      else if (event.key === 'ArrowRight') el.scrollLeft += 64
      else if (event.key === 'ArrowUp') el.scrollTop -= 64
      else if (event.key === 'ArrowDown') el.scrollTop += 64
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoomIndex, setZoom])

  // Ctrl/Cmd + wheel zooms like a native image viewer; a plain wheel still scrolls.
  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setZoom(event.deltaY < 0 ? zoomIn(zoomIndex) : zoomOut(zoomIndex))
    },
    [zoomIndex, setZoom],
  )

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

        <div className="lightbox-stage" ref={stageRef} onWheel={onWheel}>
          <img
            src={src}
            alt={alt}
            className="lightbox-img"
            draggable={false}
            style={
              size
                ? {
                    width: `${size.width}px`,
                    height: `${size.height}px`,
                    maxWidth: 'none',
                    maxHeight: 'none',
                    flexShrink: 0,
                  }
                : undefined
            }
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget
              setNatural({ width: naturalWidth, height: naturalHeight })
            }}
            onDoubleClick={() => setZoom(toggleZoom(zoomIndex))}
          />
        </div>

        <div className="lightbox-zoom" role="group" aria-label="Zoom da imagem">
          <button
            type="button"
            className="lightbox-zoom-btn"
            onClick={() => setZoom(zoomOut(zoomIndex))}
            disabled={!canZoomOut(zoomIndex)}
            aria-label="Reduzir zoom"
            title="Reduzir zoom (−)"
          >
            −
          </button>
          <span className="lightbox-zoom-level" aria-live="polite">
            {zoomPercent(zoomIndex)}%
          </span>
          <button
            type="button"
            className="lightbox-zoom-btn"
            onClick={() => setZoom(zoomIn(zoomIndex))}
            disabled={!canZoomIn(zoomIndex)}
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

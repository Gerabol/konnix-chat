import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement, Ref } from 'react'

import {
  DOUBLE_TAP_ZOOM_SCALE,
  FIT_ZOOM_INDEX,
  MAX_ZOOM_SCALE,
  clampTransform,
  displaySize,
  fitTransform,
  isDoubleTap,
  isTap,
  nextZoomScale,
  pinchTransform,
  zoomAroundPoint,
} from '../../utils/imageZoom'
import type { DisplaySize, Tap, ZoomPoint, ZoomTransform } from '../../utils/imageZoom'

const TAP_MAX_DURATION_MS = 250
const TAP_MAX_MOVEMENT_PX = 10
const DOUBLE_TAP_MAX_GAP_MS = 300
const DOUBLE_TAP_MAX_DISTANCE_PX = 24
const DRAG_START_THRESHOLD_PX = 6

type Gesture =
  | { kind: 'none' }
  | {
      kind: 'press'
      pointerId: number
      startClient: ZoomPoint
      startTransform: ZoomTransform
      startedAt: number
      moved: boolean
    }
  | {
      kind: 'pinch'
      pointerIds: [number, number]
      startMidpoint: ZoomPoint
      startDistance: number
      startTransform: ZoomTransform
      minScale: number
    }

export type ZoomableImageHandle = {
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
  panBy: (dx: number, dy: number) => void
}

type ZoomableImageProps = {
  src: string
  alt: string
  stageClassName?: string
  imageClassName?: string
  onScaleChange?: (scale: number) => void
  ref?: Ref<ZoomableImageHandle>
}

function paddingValue(value: string): number {
  return Number.parseFloat(value) || 0
}

/** Inner (content) box of the stage, ignoring its padding. */
function contentBox(el: HTMLElement): DisplaySize {
  const style = window.getComputedStyle(el)
  return {
    width: Math.max(0, el.clientWidth - paddingValue(style.paddingLeft) - paddingValue(style.paddingRight)),
    height: Math.max(0, el.clientHeight - paddingValue(style.paddingTop) - paddingValue(style.paddingBottom)),
  }
}

/** Center of the stage content box in viewport (client) coordinates. */
function contentCenter(el: HTMLElement): ZoomPoint {
  const style = window.getComputedStyle(el)
  const paddingLeft = paddingValue(style.paddingLeft)
  const paddingTop = paddingValue(style.paddingTop)
  const width = Math.max(0, el.clientWidth - paddingLeft - paddingValue(style.paddingRight))
  const height = Math.max(0, el.clientHeight - paddingTop - paddingValue(style.paddingBottom))
  const rect = el.getBoundingClientRect()
  return {
    x: rect.left + el.clientLeft + paddingLeft + width / 2,
    y: rect.top + el.clientTop + paddingTop + height / 2,
  }
}

function pointFromClient(el: HTMLElement, clientX: number, clientY: number): ZoomPoint {
  const center = contentCenter(el)
  return { x: clientX - center.x, y: clientY - center.y }
}

function distance(a: ZoomPoint, b: ZoomPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a: ZoomPoint, b: ZoomPoint): ZoomPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function sameTransform(a: ZoomTransform, b: ZoomTransform): boolean {
  return a.scale === b.scale && a.x === b.x && a.y === b.y
}

/**
 * Image surface that owns fit-to-stage sizing, pointer gestures and zoom state.
 *
 * The image keeps its fitted layout size; zoom and pan are applied with CSS
 * transforms so the browser can composite them without layout work.
 */
export function ZoomableImage({
  src,
  alt,
  stageClassName,
  imageClassName,
  onScaleChange,
  ref,
}: ZoomableImageProps): ReactElement {
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [natural, setNatural] = useState<DisplaySize | null>(null)
  const [viewport, setViewport] = useState<DisplaySize | null>(null)
  const [transform, setTransform] = useState<ZoomTransform>(fitTransform)
  const [gesturing, setGesturing] = useState(false)

  const transformRef = useRef(transform)
  const baseRef = useRef<DisplaySize | null>(null)
  const viewportRef = useRef<DisplaySize | null>(null)
  const onScaleChangeRef = useRef(onScaleChange)
  const gestureRef = useRef<Gesture>({ kind: 'none' })
  const pointersRef = useRef<Map<number, ZoomPoint>>(new Map())
  const lastTapRef = useRef<Tap | null>(null)

  const base = useMemo(
    () =>
      natural && viewport
        ? displaySize(natural.width, natural.height, viewport.width, viewport.height, FIT_ZOOM_INDEX)
        : null,
    [natural, viewport],
  )

  useEffect(() => {
    baseRef.current = base
  }, [base])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useEffect(() => {
    onScaleChangeRef.current = onScaleChange
  }, [onScaleChange])

  const applyTransform = useCallback((next: ZoomTransform) => {
    const previous = transformRef.current
    if (sameTransform(previous, next)) return
    transformRef.current = next
    setTransform(next)
    if (next.scale !== previous.scale) onScaleChangeRef.current?.(next.scale)
  }, [])

  useEffect(() => {
    setNatural(null)
    lastTapRef.current = null
    gestureRef.current = { kind: 'none' }
    pointersRef.current.clear()
    setGesturing(false)
    applyTransform(fitTransform())
  }, [src, applyTransform])

  // A cached image can finish loading before React attaches onLoad.
  useEffect(() => {
    const image = imageRef.current
    if (image?.complete && image.naturalWidth > 0) {
      setNatural({ width: image.naturalWidth, height: image.naturalHeight })
    }
  }, [src])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setViewport(contentBox(el))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep the image inside the stage after a resize or orientation change.
  useEffect(() => {
    if (!base || !viewport) return
    applyTransform(clampTransform(transformRef.current, base, viewport))
  }, [base, viewport, applyTransform])

  const zoomTo = useCallback(
    (nextScale: number) => {
      const currentBase = baseRef.current
      const currentViewport = viewportRef.current
      if (!currentBase || !currentViewport) return
      applyTransform(zoomAroundPoint(transformRef.current, { x: 0, y: 0 }, nextScale, currentBase, currentViewport))
    },
    [applyTransform],
  )

  const zoomIn = useCallback(() => zoomTo(nextZoomScale(transformRef.current.scale, 1)), [zoomTo])
  const zoomOut = useCallback(() => zoomTo(nextZoomScale(transformRef.current.scale, -1)), [zoomTo])
  const reset = useCallback(() => applyTransform(fitTransform()), [applyTransform])

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const currentBase = baseRef.current
      const currentViewport = viewportRef.current
      const current = transformRef.current
      if (!currentBase || !currentViewport || current.scale <= 1) return
      applyTransform(
        clampTransform(
          { scale: current.scale, x: current.x + dx, y: current.y + dy },
          currentBase,
          currentViewport,
        ),
      )
    },
    [applyTransform],
  )

  useImperativeHandle(ref, () => ({ zoomIn, zoomOut, reset, panBy }), [zoomIn, zoomOut, reset, panBy])

  const handleTap = useCallback(
    (clientX: number, clientY: number, time: number) => {
      const el = stageRef.current
      const tap: Tap = { x: clientX, y: clientY, time }
      if (isDoubleTap(lastTapRef.current, tap, DOUBLE_TAP_MAX_GAP_MS, DOUBLE_TAP_MAX_DISTANCE_PX)) {
        lastTapRef.current = null
        const current = transformRef.current
        if (Math.abs(current.scale - 1) <= 0.001) {
          const currentBase = baseRef.current
          const currentViewport = viewportRef.current
          if (!el || !currentBase || !currentViewport) return
          applyTransform(
            zoomAroundPoint(
              current,
              pointFromClient(el, clientX, clientY),
              DOUBLE_TAP_ZOOM_SCALE,
              currentBase,
              currentViewport,
            ),
          )
        } else {
          applyTransform(fitTransform())
        }
        return
      }
      lastTapRef.current = tap
    },
    [applyTransform],
  )

  const beginPinch = useCallback(() => {
    const el = stageRef.current
    const entries = [...pointersRef.current.entries()]
    if (!el || entries.length < 2) return
    const first = entries[0]
    const second = entries[1]
    const startMidpointClient = midpoint(first[1], second[1])
    const current = transformRef.current
    gestureRef.current = {
      kind: 'pinch',
      pointerIds: [first[0], second[0]],
      startMidpoint: pointFromClient(el, startMidpointClient.x, startMidpointClient.y),
      startDistance: distance(first[1], second[1]),
      startTransform: current,
      minScale: Math.min(1, current.scale),
    }
    lastTapRef.current = null
    setGesturing(true)
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (pointersRef.current.size >= 2) return

    const point = { x: event.clientX, y: event.clientY }
    pointersRef.current.set(event.pointerId, point)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // The browser may have released the pointer already; gestures still work.
    }

    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        kind: 'press',
        pointerId: event.pointerId,
        startClient: point,
        startTransform: transformRef.current,
        startedAt: performance.now(),
        moved: false,
      }
      return
    }

    beginPinch()
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    const gesture = gestureRef.current
    if (gesture.kind === 'press' && gesture.pointerId === event.pointerId) {
      const dx = event.clientX - gesture.startClient.x
      const dy = event.clientY - gesture.startClient.y
      if (!gesture.moved && Math.hypot(dx, dy) > DRAG_START_THRESHOLD_PX) {
        gestureRef.current = { ...gesture, moved: true }
        setGesturing(true)
      }
      const current = gestureRef.current
      if (current.kind === 'press' && current.moved && current.startTransform.scale > 1) {
        const currentBase = baseRef.current
        const currentViewport = viewportRef.current
        if (!currentBase || !currentViewport) return
        applyTransform(
          clampTransform(
            {
              scale: current.startTransform.scale,
              x: current.startTransform.x + dx,
              y: current.startTransform.y + dy,
            },
            currentBase,
            currentViewport,
          ),
        )
      }
      return
    }

    if (gesture.kind === 'pinch' && gesture.pointerIds.includes(event.pointerId)) {
      const el = stageRef.current
      const currentBase = baseRef.current
      const currentViewport = viewportRef.current
      const first = pointersRef.current.get(gesture.pointerIds[0])
      const second = pointersRef.current.get(gesture.pointerIds[1])
      if (!el || !currentBase || !currentViewport || !first || !second) return
      const midpointClient = midpoint(first, second)
      applyTransform(
        pinchTransform({
          start: gesture.startTransform,
          startMidpoint: gesture.startMidpoint,
          currentMidpoint: pointFromClient(el, midpointClient.x, midpointClient.y),
          startDistance: gesture.startDistance,
          currentDistance: distance(first, second),
          minScale: gesture.minScale,
          maxScale: MAX_ZOOM_SCALE,
          base: currentBase,
          viewport: currentViewport,
        }),
      )
    }
  }

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.delete(event.pointerId)

    const gesture = gestureRef.current
    if (gesture.kind === 'press' && gesture.pointerId === event.pointerId) {
      if (!cancelled) {
        const end: Tap = { x: event.clientX, y: event.clientY, time: performance.now() }
        const start: Tap = { ...gesture.startClient, time: gesture.startedAt }
        if (!gesture.moved && isTap(start, end, TAP_MAX_MOVEMENT_PX, TAP_MAX_DURATION_MS)) {
          handleTap(event.clientX, event.clientY, end.time)
        } else {
          lastTapRef.current = null
        }
      } else {
        lastTapRef.current = null
      }
      gestureRef.current = { kind: 'none' }
      setGesturing(false)
      return
    }

    if (gesture.kind === 'pinch' && gesture.pointerIds.includes(event.pointerId)) {
      if (cancelled) {
        gestureRef.current = { kind: 'none' }
        lastTapRef.current = null
        setGesturing(false)
        return
      }
      const remaining = [...pointersRef.current.entries()]
      if (remaining.length === 1) {
        const [pointerId, point] = remaining[0]
        gestureRef.current = {
          kind: 'press',
          pointerId,
          startClient: point,
          startTransform: transformRef.current,
          startedAt: performance.now(),
          moved: true,
        }
        return
      }
      gestureRef.current = { kind: 'none' }
      setGesturing(false)
    }
  }

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      const currentBase = baseRef.current
      const currentViewport = viewportRef.current
      const current = transformRef.current
      const zoomModifier = event.ctrlKey || event.metaKey
      if (zoomModifier) {
        event.preventDefault()
        if (!currentBase || !currentViewport) return
        const nextScale = nextZoomScale(current.scale, event.deltaY < 0 ? 1 : -1)
        applyTransform(
          zoomAroundPoint(current, pointFromClient(el, event.clientX, event.clientY), nextScale, currentBase, currentViewport),
        )
        return
      }
      if (current.scale <= 1 || !currentBase || !currentViewport) return
      event.preventDefault()
      applyTransform(
        clampTransform(
          { scale: current.scale, x: current.x - event.deltaX, y: current.y - event.deltaY },
          currentBase,
          currentViewport,
        ),
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyTransform])

  const className = ['zoom-surface', stageClassName, transform.scale > 1 ? 'is-zoomed' : '', gesturing ? 'is-gesturing' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={stageRef}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishPointer(event, false)}
      onPointerCancel={(event) => finishPointer(event, true)}
    >
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className={imageClassName}
        draggable={false}
        style={
          base
            ? {
                width: `${base.width}px`,
                height: `${base.height}px`,
                maxWidth: 'none',
                maxHeight: 'none',
                flexShrink: 0,
                transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
              }
            : undefined
        }
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget
          setNatural({ width: naturalWidth, height: naturalHeight })
        }}
      />
    </div>
  )
}

/**
 * Pure zoom math for the in-app image viewer (lightbox).
 *
 * Kept free of React and DOM APIs so it can be unit tested with `node --test`.
 * The viewer always starts at "fit" (zoom 1), where the whole image is visible
 * inside the stage. Zoom steps multiply that fitted size, so zooming behaves
 * identically on phones, desktop and the Tauri shell.
 */

export const ZOOM_STEPS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

/** Index of the "fit to screen" step inside ZOOM_STEPS. */
export const FIT_ZOOM_INDEX = ZOOM_STEPS.indexOf(1)

/** Continuous gesture scale bounds. */
export const MIN_ZOOM_SCALE = ZOOM_STEPS[0]
export const MAX_ZOOM_SCALE = ZOOM_STEPS[ZOOM_STEPS.length - 1]
export const DOUBLE_TAP_ZOOM_SCALE = 2

export function clampZoomIndex(index: number): number {
  if (!Number.isFinite(index)) return FIT_ZOOM_INDEX
  return Math.min(ZOOM_STEPS.length - 1, Math.max(0, Math.trunc(index)))
}

export function zoomValue(index: number): number {
  return ZOOM_STEPS[clampZoomIndex(index)]
}

export function zoomPercent(index: number): number {
  return Math.round(zoomValue(index) * 100)
}

export function zoomIn(index: number): number {
  return clampZoomIndex(index + 1)
}

export function zoomOut(index: number): number {
  return clampZoomIndex(index - 1)
}

/** Double click / double tap: jump between "fit" and 2x. */
export function toggleZoom(index: number): number {
  return clampZoomIndex(index) === FIT_ZOOM_INDEX ? clampZoomIndex(FIT_ZOOM_INDEX + 3) : FIT_ZOOM_INDEX
}

export function canZoomIn(index: number): boolean {
  return clampZoomIndex(index) < ZOOM_STEPS.length - 1
}

export function canZoomOut(index: number): boolean {
  return clampZoomIndex(index) > 0
}

/**
 * Scale that makes the image fit the stage. Small images are never blown up on
 * open (that would only look blurry), but zooming in may still enlarge them.
 */
export function fitScale(
  naturalWidth: number,
  naturalHeight: number,
  stageWidth: number,
  stageHeight: number,
): number {
  if (!(naturalWidth > 0) || !(naturalHeight > 0) || !(stageWidth > 0) || !(stageHeight > 0)) return 1
  return Math.min(1, stageWidth / naturalWidth, stageHeight / naturalHeight)
}

export type DisplaySize = { width: number; height: number }

export type ZoomTransform = { scale: number; x: number; y: number }
export type ZoomPoint = { x: number; y: number }
export type Tap = { x: number; y: number; time: number }

export type PinchInput = {
  start: ZoomTransform
  startMidpoint: ZoomPoint
  currentMidpoint: ZoomPoint
  startDistance: number
  currentDistance: number
  minScale: number
  maxScale: number
  base: DisplaySize
  viewport: DisplaySize
}

/**
 * Rendered size of the image in CSS pixels, or null while the image or the
 * stage has no measurable size yet (the caller then falls back to CSS).
 */
export function displaySize(
  naturalWidth: number,
  naturalHeight: number,
  stageWidth: number,
  stageHeight: number,
  zoomIndex: number,
): DisplaySize | null {
  if (!(naturalWidth > 0) || !(naturalHeight > 0) || !(stageWidth > 0) || !(stageHeight > 0)) return null
  const scale = fitScale(naturalWidth, naturalHeight, stageWidth, stageHeight) * zoomValue(zoomIndex)
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  }
}

export function fitTransform(): ZoomTransform {
  return { scale: 1, x: 0, y: 0 }
}

export function scalePercent(scale: number): number {
  return Math.round((Number.isFinite(scale) ? scale : 1) * 100)
}

export function clampScale(scale: number, min = MIN_ZOOM_SCALE, max = MAX_ZOOM_SCALE): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(max, Math.max(min, scale))
}

/** Next discrete zoom step from a continuous pinch scale. */
export function nextZoomScale(scale: number, direction: 1 | -1): number {
  const current = clampScale(scale)
  if (direction > 0) {
    for (const step of ZOOM_STEPS) {
      if (step > current + 1e-6) return step
    }
    return MAX_ZOOM_SCALE
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < current - 1e-6) return ZOOM_STEPS[i]
  }
  return MIN_ZOOM_SCALE
}

/** Keep the image covered by the stage, never exposing empty space. */
export function clampTransform(
  transform: ZoomTransform,
  base: DisplaySize,
  viewport: DisplaySize,
): ZoomTransform {
  const maxX = Math.max(0, (base.width * transform.scale - viewport.width) / 2)
  const maxY = Math.max(0, (base.height * transform.scale - viewport.height) / 2)
  return {
    scale: transform.scale,
    x: Math.min(maxX, Math.max(-maxX, transform.x)),
    y: Math.min(maxY, Math.max(-maxY, transform.y)),
  }
}

/** Zoom to a scale while keeping the content under `point` anchored. */
export function zoomAroundPoint(
  transform: ZoomTransform,
  point: ZoomPoint,
  nextScale: number,
  base: DisplaySize,
  viewport: DisplaySize,
): ZoomTransform {
  const scale = clampScale(nextScale)
  if (!(transform.scale > 0)) {
    return clampTransform({ ...transform, scale }, base, viewport)
  }
  const ratio = scale / transform.scale
  return clampTransform(
    {
      scale,
      x: point.x - (point.x - transform.x) * ratio,
      y: point.y - (point.y - transform.y) * ratio,
    },
    base,
    viewport,
  )
}

/** Two-finger scale around the initial midpoint, following its movement. */
export function pinchTransform(input: PinchInput): ZoomTransform {
  const { start, startMidpoint, currentMidpoint, startDistance, currentDistance, minScale, maxScale, base, viewport } =
    input
  if (!(startDistance > 0) || !(currentDistance > 0) || !(start.scale > 0)) {
    return clampTransform({ ...start, scale: 1 }, base, viewport)
  }
  const scale = clampScale(start.scale * (currentDistance / startDistance), minScale, maxScale)
  const ratio = scale / start.scale
  return clampTransform(
    {
      scale,
      x: currentMidpoint.x - (startMidpoint.x - start.x) * ratio,
      y: currentMidpoint.y - (startMidpoint.y - start.y) * ratio,
    },
    base,
    viewport,
  )
}

export function isTap(start: Tap, end: Tap, maxMovement = 10, maxDuration = 250): boolean {
  const duration = end.time - start.time
  return duration >= 0 && duration <= maxDuration && Math.hypot(end.x - start.x, end.y - start.y) <= maxMovement
}

export function isDoubleTap(previous: Tap | null, current: Tap, maxGapMs = 300, maxDistance = 24): boolean {
  if (!previous) return false
  const gap = current.time - previous.time
  return gap >= 0 && gap <= maxGapMs && Math.hypot(current.x - previous.x, current.y - previous.y) <= maxDistance
}

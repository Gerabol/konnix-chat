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

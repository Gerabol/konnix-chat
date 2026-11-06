import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  DOUBLE_TAP_ZOOM_SCALE,
  FIT_ZOOM_INDEX,
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
  ZOOM_STEPS,
  canZoomIn,
  canZoomOut,
  clampScale,
  clampTransform,
  clampZoomIndex,
  displaySize,
  fitScale,
  fitTransform,
  isDoubleTap,
  isTap,
  nextZoomScale,
  pinchTransform,
  scalePercent,
  toggleZoom,
  zoomAroundPoint,
  zoomIn,
  zoomOut,
  zoomPercent,
  zoomValue,
} from './imageZoom.ts'

test('ZOOM_STEPS keeps "fit" available and ordered', () => {
  assert.equal(FIT_ZOOM_INDEX, 2)
  assert.equal(zoomValue(FIT_ZOOM_INDEX), 1)
  const sorted = [...ZOOM_STEPS].sort((a, b) => a - b)
  assert.deepEqual(sorted, [...ZOOM_STEPS])
})

test('clampZoomIndex blocks out-of-range and invalid indexes', () => {
  assert.equal(clampZoomIndex(-5), 0)
  assert.equal(clampZoomIndex(99), ZOOM_STEPS.length - 1)
  assert.equal(clampZoomIndex(2.7), 2)
  assert.equal(clampZoomIndex(Number.NaN), FIT_ZOOM_INDEX)
})

test('zoom in and out walk the steps and saturate at the ends', () => {
  assert.equal(zoomIn(FIT_ZOOM_INDEX), 3)
  assert.equal(zoomOut(FIT_ZOOM_INDEX), 1)
  assert.equal(zoomIn(zoomIn(zoomIn(FIT_ZOOM_INDEX))), FIT_ZOOM_INDEX + 3)
  assert.equal(zoomIn(zoomIn(zoomIn(zoomIn(zoomIn(FIT_ZOOM_INDEX))))), ZOOM_STEPS.length - 1)
  assert.equal(zoomIn(zoomIn(zoomIn(zoomIn(zoomIn(zoomIn(FIT_ZOOM_INDEX)))))), ZOOM_STEPS.length - 1)
  assert.equal(zoomOut(zoomOut(zoomOut(FIT_ZOOM_INDEX))), 0)
  assert.equal(zoomOut(zoomOut(zoomOut(zoomOut(FIT_ZOOM_INDEX)))), 0)
  assert.equal(canZoomIn(ZOOM_STEPS.length - 1), false)
  assert.equal(canZoomOut(0), false)
  assert.equal(canZoomIn(FIT_ZOOM_INDEX), true)
  assert.equal(canZoomOut(FIT_ZOOM_INDEX), true)
})

test('zoomPercent is the step value as a whole percentage', () => {
  assert.equal(zoomPercent(FIT_ZOOM_INDEX), 100)
  assert.equal(zoomPercent(0), 50)
  assert.equal(zoomPercent(ZOOM_STEPS.length - 1), 400)
})

test('toggleZoom switches between fit and 2x', () => {
  const zoomed = toggleZoom(FIT_ZOOM_INDEX)
  assert.equal(zoomValue(zoomed), 2)
  assert.equal(toggleZoom(zoomed), FIT_ZOOM_INDEX)
})

test('fitScale uses the tightest axis and never upscales small images', () => {
  // Landscape image limited by width
  assert.equal(fitScale(2000, 1000, 1000, 800), 0.5)
  // Portrait image limited by height
  assert.equal(fitScale(1000, 2000, 1000, 800), 0.4)
  // Tiny image stays at its natural size
  assert.equal(fitScale(100, 50, 1000, 800), 1)
  // Missing measurements fall back to 1
  assert.equal(fitScale(0, 100, 1000, 800), 1)
  assert.equal(fitScale(100, 100, 0, 800), 1)
})

test('displaySize multiplies the fitted size by the zoom step', () => {
  // 2000x1000 fitted into 1000x800 => 1000x500 at 1x
  assert.deepEqual(displaySize(2000, 1000, 1000, 800, FIT_ZOOM_INDEX), { width: 1000, height: 500 })
  // 2x
  assert.deepEqual(displaySize(2000, 1000, 1000, 800, FIT_ZOOM_INDEX + 3), { width: 2000, height: 1000 })
  // 50%
  assert.deepEqual(displaySize(2000, 1000, 1000, 800, 0), { width: 500, height: 250 })
  // 4x
  assert.deepEqual(displaySize(2000, 1000, 1000, 800, ZOOM_STEPS.length - 1), { width: 4000, height: 2000 })
})

test('displaySize never returns a zero or negative box', () => {
  const size = displaySize(4, 2, 1, 1, 0)
  assert.ok(size)
  assert.ok(size.width >= 1 && size.height >= 1)
})

test('displaySize returns null until the image and stage are measurable', () => {
  assert.equal(displaySize(0, 0, 800, 600, FIT_ZOOM_INDEX), null)
  assert.equal(displaySize(1200, 800, 0, 600, FIT_ZOOM_INDEX), null)
  assert.equal(displaySize(1200, 800, 800, 0, FIT_ZOOM_INDEX), null)
})

test('displaySize strictly preserves aspect ratio across all zoom steps', () => {
  const naturalWidth = 1920
  const naturalHeight = 1080
  const stageWidth = 1000
  const stageHeight = 700
  const expectedRatio = naturalWidth / naturalHeight

  for (let i = 0; i < ZOOM_STEPS.length; i++) {
    const size = displaySize(naturalWidth, naturalHeight, stageWidth, stageHeight, i)
    assert.ok(size, `Size should exist for zoom step index ${i}`)
    const ratio = size.width / size.height
    // Tolerance for 1px rounding
    assert.ok(Math.abs(ratio - expectedRatio) < 0.02, `Aspect ratio deviated at step ${i}: got ${ratio}, expected ${expectedRatio}`)
  }
})

test('continuous zoom helpers clamp and round the scale', () => {
  assert.equal(MIN_ZOOM_SCALE, 0.5)
  assert.equal(MAX_ZOOM_SCALE, 4)
  assert.equal(DOUBLE_TAP_ZOOM_SCALE, 2)
  assert.equal(clampScale(0.25), MIN_ZOOM_SCALE)
  assert.equal(clampScale(9), MAX_ZOOM_SCALE)
  assert.equal(clampScale(2.37), 2.37)
  assert.equal(clampScale(Number.NaN), 1)
  assert.equal(scalePercent(1), 100)
  assert.equal(scalePercent(1.634), 163)
  assert.equal(scalePercent(Number.NaN), 100)
  assert.deepEqual(fitTransform(), { scale: 1, x: 0, y: 0 })
})

test('nextZoomScale walks the existing steps from a continuous scale', () => {
  assert.equal(nextZoomScale(1, 1), 1.25)
  assert.equal(nextZoomScale(1, -1), 0.75)
  assert.equal(nextZoomScale(1.63, 1), 2)
  assert.equal(nextZoomScale(1.63, -1), 1.5)
  assert.equal(nextZoomScale(4, 1), 4)
  assert.equal(nextZoomScale(0.5, -1), 0.5)
})

test('zoomAroundPoint keeps the touched content anchored', () => {
  const base = { width: 800, height: 600 }
  const viewport = { width: 800, height: 600 }
  assert.deepEqual(
    zoomAroundPoint({ scale: 1, x: 0, y: 0 }, { x: 100, y: 50 }, 2, base, viewport),
    { scale: 2, x: -100, y: -50 },
  )
  assert.deepEqual(
    zoomAroundPoint({ scale: 1, x: 0, y: 0 }, { x: 0, y: 0 }, 2, base, viewport),
    { scale: 2, x: 0, y: 0 },
  )
})

test('clampTransform never exposes empty space around a zoomed image', () => {
  const base = { width: 1000, height: 500 }
  const viewport = { width: 1000, height: 800 }
  assert.deepEqual(
    clampTransform({ scale: 2, x: 500, y: 500 }, base, viewport),
    { scale: 2, x: 500, y: 100 },
  )
  assert.deepEqual(
    clampTransform({ scale: 1, x: 20, y: 20 }, base, viewport),
    { scale: 1, x: 0, y: 0 },
  )
  assert.deepEqual(
    clampTransform({ scale: 2, x: 500, y: 500 }, { width: 400, height: 200 }, viewport),
    { scale: 2, x: 0, y: 0 },
  )
})

test('pinchTransform zooms around the midpoint and follows both fingers', () => {
  const base = { width: 800, height: 600 }
  const viewport = { width: 800, height: 600 }
  const common = {
    start: { scale: 1, x: 0, y: 0 },
    startMidpoint: { x: 0, y: 0 },
    startDistance: 100,
    currentDistance: 200,
    minScale: 1,
    maxScale: 4,
    base,
    viewport,
  }
  assert.deepEqual(
    pinchTransform({ ...common, currentMidpoint: { x: 0, y: 0 } }),
    { scale: 2, x: 0, y: 0 },
  )
  assert.deepEqual(
    pinchTransform({ ...common, currentMidpoint: { x: 50, y: 25 } }),
    { scale: 2, x: 50, y: 25 },
  )
  assert.deepEqual(
    pinchTransform({ ...common, currentMidpoint: { x: 900, y: 900 } }),
    { scale: 2, x: 400, y: 300 },
  )
})

test('pinchTransform respects scale bounds and invalid distances', () => {
  const common = {
    start: { scale: 1, x: 0, y: 0 },
    startMidpoint: { x: 0, y: 0 },
    currentMidpoint: { x: 0, y: 0 },
    minScale: 1,
    maxScale: 4,
    base: { width: 800, height: 600 },
    viewport: { width: 800, height: 600 },
  }
  assert.equal(pinchTransform({ ...common, startDistance: 200, currentDistance: 100 }).scale, 1)
  assert.equal(pinchTransform({ ...common, startDistance: 100, currentDistance: 1000 }).scale, 4)
  assert.deepEqual(
    pinchTransform({ ...common, startDistance: 0, currentDistance: 100 }),
    { scale: 1, x: 0, y: 0 },
  )
})

test('isTap and isDoubleTap use movement, duration and gap thresholds', () => {
  const first = { x: 100, y: 100, time: 0 }
  assert.equal(isTap(first, { x: 104, y: 103, time: 200 }), true)
  assert.equal(isTap(first, { x: 120, y: 100, time: 200 }), false)
  assert.equal(isTap(first, { x: 100, y: 100, time: 300 }), false)
  assert.equal(isDoubleTap(first, { x: 108, y: 105, time: 240 }), true)
  assert.equal(isDoubleTap(first, { x: 130, y: 100, time: 240 }), false)
  assert.equal(isDoubleTap(first, { x: 100, y: 100, time: 400 }), false)
  assert.equal(isDoubleTap(null, first), false)
})

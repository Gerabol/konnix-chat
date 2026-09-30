import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  FIT_ZOOM_INDEX,
  ZOOM_STEPS,
  canZoomIn,
  canZoomOut,
  clampZoomIndex,
  displaySize,
  fitScale,
  toggleZoom,
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

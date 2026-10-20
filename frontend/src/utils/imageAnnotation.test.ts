import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  calculateArrowHead,
  calculateFontSize,
  calculateHighlighterWidth,
  calculateStrokeWidth,
  clientToCanvasPoint,
  normalizeRect,
  renderAnnotation,
  type AnnotationAction,
  type Point,
} from './imageAnnotation.ts'

test('normalizeRect handles drag in all 4 quadrant directions correctly', () => {
  // Top-left to bottom-right
  const r1 = normalizeRect({ x: 10, y: 20 }, { x: 100, y: 80 })
  assert.deepEqual(r1, { x: 10, y: 20, width: 90, height: 60 })

  // Bottom-right to top-left
  const r2 = normalizeRect({ x: 100, y: 80 }, { x: 10, y: 20 })
  assert.deepEqual(r2, { x: 10, y: 20, width: 90, height: 60 })

  // Top-right to bottom-left
  const r3 = normalizeRect({ x: 100, y: 20 }, { x: 10, y: 80 })
  assert.deepEqual(r3, { x: 10, y: 20, width: 90, height: 60 })

  // Single point (width and height clamp to minimum 1px)
  const r4 = normalizeRect({ x: 50, y: 50 }, { x: 50, y: 50 })
  assert.deepEqual(r4, { x: 50, y: 50, width: 1, height: 1 })
})

test('calculateArrowHead calculates correct directional arrow tips', () => {
  const from: Point = { x: 0, y: 0 }
  const to: Point = { x: 100, y: 0 } // Pointing to the right
  const head = calculateArrowHead(from, to, 20, Math.PI / 6)

  // Arrow points backwards from (100, 0)
  assert.ok(head.left.x < to.x, 'Left tip x should be behind target x')
  assert.ok(head.right.x < to.x, 'Right tip x should be behind target x')
  // Symmetrical along y axis
  assert.ok(Math.abs(head.left.y + head.right.y) < 1e-6, 'Left and right tips should be symmetrical across y=0')

  // Pointing downwards
  const downTo: Point = { x: 0, y: 100 }
  const downHead = calculateArrowHead(from, downTo, 20, Math.PI / 6)
  assert.ok(downHead.left.y < downTo.y, 'Left tip y should be above arrow end')
  assert.ok(downHead.right.y < downTo.y, 'Right tip y should be above arrow end')
})

test('calculateStrokeWidth and calculateHighlighterWidth adapt to image dimensions', () => {
  // Standard photo (1920x1080)
  const w1920Thin = calculateStrokeWidth(1920, 1080, 'thin')
  const w1920Med = calculateStrokeWidth(1920, 1080, 'medium')
  const w1920Thick = calculateStrokeWidth(1920, 1080, 'thick')

  assert.ok(w1920Thin < w1920Med)
  assert.ok(w1920Med < w1920Thick)

  // Small icon/thumbnail (100x100) respects minimum pixel caps
  const wSmall = calculateStrokeWidth(100, 100, 'thin')
  assert.ok(wSmall >= 3, 'Should respect minPixels cap')

  // Highlighter width is substantially wider than normal pen for quick highlighting
  const hlWidth = calculateHighlighterWidth(1920, 1080, 'medium')
  assert.ok(hlWidth > w1920Med * 2, 'Highlighter width must be at least 2x the standard pen width')
})

test('calculateFontSize scales proportionally and has a safe minimum', () => {
  const fSmall = calculateFontSize(100, 100, 'medium')
  assert.equal(fSmall, 16, 'Should clamp to minimum 16px font size')

  const fLarge = calculateFontSize(2000, 2000, 'medium')
  assert.ok(fLarge > 40, 'Large image should have proportionally larger font size')

  const fThick = calculateFontSize(2000, 2000, 'thick')
  assert.ok(fThick > fLarge, 'Thick size should yield larger font than medium')
})

test('clientToCanvasPoint maps screen coords to native image coords with boundaries', () => {
  const canvasRect = { left: 100, top: 50, width: 400, height: 300 }
  const canvasResolution = { width: 800, height: 600 } // 2x scale

  // Center point
  const center = clientToCanvasPoint(300, 200, canvasRect, canvasResolution)
  assert.deepEqual(center, { x: 400, y: 300 })

  // Out-of-bounds left/top clamp to 0
  const outsideTopLeft = clientToCanvasPoint(50, 20, canvasRect, canvasResolution)
  assert.deepEqual(outsideTopLeft, { x: 0, y: 0 })

  // Out-of-bounds right/bottom clamp to max resolution
  const outsideBottomRight = clientToCanvasPoint(600, 450, canvasRect, canvasResolution)
  assert.deepEqual(outsideBottomRight, { x: 800, y: 600 })

  // Degenerate rect returns {0, 0}
  const zeroRect = clientToCanvasPoint(20, 20, { left: 0, top: 0, width: 0, height: 0 }, canvasResolution)
  assert.deepEqual(zeroRect, { x: 0, y: 0 })
})

test('renderAnnotation handles all action types without throwing', () => {
  const calls: string[] = []
  const mockCtx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    stroke: () => calls.push('stroke'),
    fill: () => calls.push('fill'),
    closePath: () => calls.push('closePath'),
    arc: () => calls.push('arc'),
    ellipse: () => calls.push('ellipse'),
    strokeRect: () => calls.push('strokeRect'),
    rect: () => calls.push('rect'),
    fillText: () => calls.push('fillText'),
    measureText: () => ({ width: 50 }),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
    globalAlpha: 1,
    font: '',
    textBaseline: '',
  } as unknown as CanvasRenderingContext2D

  // 1. Pen action
  const penAction: AnnotationAction = {
    type: 'pen',
    color: '#ff0000',
    width: 5,
    points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
  }
  renderAnnotation(mockCtx, penAction)
  assert.ok(calls.includes('stroke'))

  // 2. Highlighter action
  calls.length = 0
  const hlAction: AnnotationAction = {
    type: 'highlighter',
    color: '#ffff00',
    width: 20,
    points: [{ x: 0, y: 0 }, { x: 50, y: 50 }],
  }
  renderAnnotation(mockCtx, hlAction)
  assert.equal(mockCtx.globalAlpha, 0.35)
  assert.ok(calls.includes('stroke'))

  // 3. Shape: Rectangle
  calls.length = 0
  const rectAction: AnnotationAction = {
    type: 'shape',
    shapeType: 'rectangle',
    color: '#00ff00',
    width: 4,
    start: { x: 10, y: 10 },
    end: { x: 60, y: 60 },
  }
  renderAnnotation(mockCtx, rectAction)
  assert.ok(calls.includes('strokeRect'))

  // 4. Shape: Arrow
  calls.length = 0
  const arrowAction: AnnotationAction = {
    type: 'shape',
    shapeType: 'arrow',
    color: '#0000ff',
    width: 4,
    start: { x: 10, y: 10 },
    end: { x: 100, y: 10 },
  }
  renderAnnotation(mockCtx, arrowAction)
  assert.ok(calls.includes('stroke'))
  assert.ok(calls.includes('fill'))

  // 5. Text
  calls.length = 0
  const textAction: AnnotationAction = {
    type: 'text',
    text: 'Atenção aqui!',
    color: '#ffffff',
    fontSize: 24,
    position: { x: 30, y: 30 },
  }
  renderAnnotation(mockCtx, textAction)
  assert.ok(calls.includes('fillText'))
})

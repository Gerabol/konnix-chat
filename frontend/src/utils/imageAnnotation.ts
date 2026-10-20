export type Point = {
  x: number
  y: number
}

export type ShapeType = 'rectangle' | 'circle' | 'arrow'

export type ToolType = 'pen' | 'highlighter' | 'shape' | 'text'

export type AnnotationAction =
  | {
      type: 'pen'
      color: string
      width: number
      points: Point[]
    }
  | {
      type: 'highlighter'
      color: string
      width: number
      points: Point[]
    }
  | {
      type: 'shape'
      shapeType: ShapeType
      color: string
      width: number
      start: Point
      end: Point
    }
  | {
      type: 'text'
      text: string
      color: string
      fontSize: number
      position: Point
    }

export const DEFAULT_ANNOTATION_COLORS = [
  '#ef4444', // Vermelho
  '#facc15', // Amarelo
  '#22c55e', // Verde
  '#3b82f6', // Azul
  '#f97316', // Laranja
  '#a855f7', // Roxo
  '#ffffff', // Branco
  '#000000', // Preto
] as const

export type StrokeSizeId = 'thin' | 'medium' | 'thick'

export interface StrokeOption {
  id: StrokeSizeId
  label: string
  factor: number
  minPixels: number
}

export const STROKE_WIDTH_OPTIONS: readonly StrokeOption[] = [
  { id: 'thin', label: 'Fino', factor: 0.005, minPixels: 3 },
  { id: 'medium', label: 'Médio', factor: 0.012, minPixels: 7 },
  { id: 'thick', label: 'Grosso', factor: 0.024, minPixels: 14 },
] as const

/**
 * Calcula a largura em pixels de acordo com a maior dimensão da imagem nativa.
 * Garante proporcionalidade tanto em fotos pequenas quanto em fotos de alta resolução.
 */
export function calculateStrokeWidth(
  imageWidth: number,
  imageHeight: number,
  sizeId: StrokeSizeId = 'medium',
): number {
  const maxDim = Math.max(imageWidth, imageHeight, 1)
  const option = STROKE_WIDTH_OPTIONS.find((opt) => opt.id === sizeId) ?? STROKE_WIDTH_OPTIONS[1]
  return Math.max(option.minPixels, Math.round(maxDim * option.factor))
}

/**
 * Calcula a largura do traço do marca-texto, que é mais largo para cobrir trechos facilmente.
 */
export function calculateHighlighterWidth(
  imageWidth: number,
  imageHeight: number,
  sizeId: StrokeSizeId = 'medium',
): number {
  const baseWidth = calculateStrokeWidth(imageWidth, imageHeight, sizeId)
  return Math.round(baseWidth * 2.8)
}

/**
 * Calcula o tamanho de fonte proporcional à imagem para anotações de texto.
 */
export function calculateFontSize(
  imageWidth: number,
  imageHeight: number,
  sizeId: StrokeSizeId = 'medium',
): number {
  const maxDim = Math.max(imageWidth, imageHeight, 1)
  const factor = sizeId === 'thin' ? 0.025 : sizeId === 'thick' ? 0.055 : 0.038
  return Math.max(16, Math.round(maxDim * factor))
}

/**
 * Normaliza coordenadas de início e fim para obter retângulo canônico (x, y, largura, altura).
 */
export function normalizeRect(
  start: Point,
  end: Point,
): { x: number; y: number; width: number; height: number } {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const width = Math.max(1, Math.abs(end.x - start.x))
  const height = Math.max(1, Math.abs(end.y - start.y))
  return { x, y, width, height }
}

/**
 * Calcula os dois pontos da cabeça de uma seta direcional usando trigonometria vetorial.
 */
export function calculateArrowHead(
  from: Point,
  to: Point,
  headLength: number = 24,
  headAngle: number = Math.PI / 6,
): { left: Point; right: Point } {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  return {
    left: {
      x: to.x - headLength * Math.cos(angle - headAngle),
      y: to.y - headLength * Math.sin(angle - headAngle),
    },
    right: {
      x: to.x - headLength * Math.cos(angle + headAngle),
      y: to.y - headLength * Math.sin(angle + headAngle),
    },
  }
}

/**
 * Converte coordenadas de um clique ou toque na tela para o espaço nativo de pixels da imagem.
 */
export function clientToCanvasPoint(
  clientX: number,
  clientY: number,
  canvasRect: { left: number; top: number; width: number; height: number },
  canvasResolution: { width: number; height: number },
): Point {
  if (canvasRect.width <= 0 || canvasRect.height <= 0) {
    return { x: 0, y: 0 }
  }
  const scaleX = canvasResolution.width / canvasRect.width
  const scaleY = canvasResolution.height / canvasRect.height
  const rawX = (clientX - canvasRect.left) * scaleX
  const rawY = (clientY - canvasRect.top) * scaleY
  return {
    x: Math.max(0, Math.min(canvasResolution.width, rawX)),
    y: Math.max(0, Math.min(canvasResolution.height, rawY)),
  }
}

/**
 * Renderiza uma única anotação no contexto 2D de canvas fornecido.
 */
export function renderAnnotation(ctx: CanvasRenderingContext2D, action: AnnotationAction): void {
  ctx.save()
  try {
    if (action.type === 'pen') {
      if (action.points.length === 0) return
      ctx.strokeStyle = action.color
      ctx.lineWidth = action.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (action.points.length === 1) {
        ctx.fillStyle = action.color
        ctx.beginPath()
        ctx.arc(action.points[0].x, action.points[0].y, action.width / 2, 0, Math.PI * 2)
        ctx.fill()
        return
      }
      ctx.beginPath()
      ctx.moveTo(action.points[0].x, action.points[0].y)
      for (let i = 1; i < action.points.length; i++) {
        ctx.lineTo(action.points[i].x, action.points[i].y)
      }
      ctx.stroke()
      return
    }

    if (action.type === 'highlighter') {
      if (action.points.length === 0) return
      ctx.strokeStyle = action.color
      ctx.lineWidth = action.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 0.35 // Efeito marca-texto translúcido
      if (action.points.length === 1) {
        ctx.fillStyle = action.color
        ctx.beginPath()
        ctx.arc(action.points[0].x, action.points[0].y, action.width / 2, 0, Math.PI * 2)
        ctx.fill()
        return
      }
      ctx.beginPath()
      ctx.moveTo(action.points[0].x, action.points[0].y)
      for (let i = 1; i < action.points.length; i++) {
        ctx.lineTo(action.points[i].x, action.points[i].y)
      }
      ctx.stroke()
      return
    }

    if (action.type === 'shape') {
      ctx.strokeStyle = action.color
      ctx.fillStyle = action.color
      ctx.lineWidth = action.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (action.shapeType === 'rectangle') {
        const rect = normalizeRect(action.start, action.end)
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
        return
      }

      if (action.shapeType === 'circle') {
        const rect = normalizeRect(action.start, action.end)
        const cx = rect.x + rect.width / 2
        const cy = rect.y + rect.height / 2
        const rx = rect.width / 2
        const ry = rect.height / 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
        return
      }

      if (action.shapeType === 'arrow') {
        // Haste da seta
        ctx.beginPath()
        ctx.moveTo(action.start.x, action.start.y)
        ctx.lineTo(action.end.x, action.end.y)
        ctx.stroke()

        // Cabeça direcional da seta
        const headLength = Math.max(16, action.width * 3.2)
        const head = calculateArrowHead(action.start, action.end, headLength)
        ctx.beginPath()
        ctx.moveTo(action.end.x, action.end.y)
        ctx.lineTo(head.left.x, head.left.y)
        ctx.lineTo(head.right.x, head.right.y)
        ctx.closePath()
        ctx.fill()
        return
      }
    }

    if (action.type === 'text') {
      const text = action.text.trim()
      if (!text) return
      ctx.font = `600 ${action.fontSize}px sans-serif`
      ctx.textBaseline = 'top'

      const lines = text.split('\n')
      const lineHeight = Math.round(action.fontSize * 1.3)
      const padding = Math.round(action.fontSize * 0.25)

      // Calcula dimensões do bloco para fundo escuro semi-transparente que garante legibilidade
      let maxLineWidth = 0
      for (const line of lines) {
        const metrics = ctx.measureText(line)
        if (metrics.width > maxLineWidth) maxLineWidth = metrics.width
      }

      const totalHeight = lines.length * lineHeight
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
      ctx.beginPath()
      const radius = Math.min(8, Math.round(action.fontSize * 0.2))
      const bgX = action.position.x - padding
      const bgY = action.position.y - padding
      const bgW = maxLineWidth + padding * 2
      const bgH = totalHeight + padding * 2
      ctx.roundRect ? ctx.roundRect(bgX, bgY, bgW, bgH, radius) : ctx.rect(bgX, bgY, bgW, bgH)
      ctx.fill()

      // Desenha o texto com a cor escolhida
      ctx.fillStyle = action.color
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], action.position.x, action.position.y + i * lineHeight)
      }
      return
    }
  } finally {
    ctx.restore()
  }
}

/**
 * Renderiza todas as ações sobre o canvas.
 */
export function renderAllAnnotations(
  ctx: CanvasRenderingContext2D,
  actions: readonly AnnotationAction[],
): void {
  for (const action of actions) {
    renderAnnotation(ctx, action)
  }
}

/**
 * Exporta a imagem original renderizada com as anotações para um Blob de alta fidelidade.
 */
export async function exportAnnotatedImage(
  imageElement: HTMLImageElement,
  actions: readonly AnnotationAction[],
  mimeType: string = 'image/png',
  quality: number = 0.95,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = imageElement.naturalWidth || imageElement.width
  canvas.height = imageElement.naturalHeight || imageElement.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Falha ao obter o contexto 2D do canvas para exportação')
  }

  // 1. Desenha a foto original na resolução máxima
  ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height)

  // 2. Renderiza as anotações
  renderAllAnnotations(ctx, actions)

  // 3. Converte para Blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Falha ao exportar imagem anotada do canvas'))
        }
      },
      mimeType,
      quality,
    )
  })
}

/**
 * Cria um objeto File pronto para upload com as anotações aplicadas.
 */
export async function createAnnotatedFile(
  originalFile: File,
  imageElement: HTMLImageElement,
  actions: readonly AnnotationAction[],
): Promise<File> {
  const mimeType = originalFile.type && originalFile.type.startsWith('image/')
    ? originalFile.type
    : 'image/png'
  const blob = await exportAnnotatedImage(imageElement, actions, mimeType)
  return new File([blob], originalFile.name, {
    type: mimeType,
    lastModified: Date.now(),
  })
}

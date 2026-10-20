import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react'

import { useEscapeClose } from '../../hooks/useEscapeClose'
import { requestViewportSync } from '../../hooks/useMobileViewport'
import {
  DEFAULT_ANNOTATION_COLORS,
  STROKE_WIDTH_OPTIONS,
  calculateFontSize,
  calculateHighlighterWidth,
  calculateStrokeWidth,
  clientToCanvasPoint,
  createAnnotatedFile,
  renderAllAnnotations,
  renderAnnotation,
  type AnnotationAction,
  type Point,
  type ShapeType,
  type StrokeSizeId,
  type ToolType,
} from '../../utils/imageAnnotation'
import {
  IconArrowRight,
  IconCheck,
  IconCircle,
  IconHighlighter,
  IconPencil,
  IconRotateCcw,
  IconSend,
  IconSquare,
  IconTrash,
  IconType,
  IconX,
} from '../icons'

export interface ImageEditorModalProps {
  file: File
  initialCaption?: string
  onClose: () => void
  onSend: (editedFile: File, caption: string) => Promise<void> | void
  onSaveDraft?: (editedFile: File) => void
}

export function ImageEditorModal({
  file,
  initialCaption = '',
  onClose,
  onSend,
  onSaveDraft,
}: ImageEditorModalProps) {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const [stageBox, setStageBox] = useState<{ width: number; height: number }>({ width: 800, height: 600 })

  // Anotações e ferramentas
  const [actions, setActions] = useState<AnnotationAction[]>([])
  const [currentAction, setCurrentAction] = useState<AnnotationAction | null>(null)
  const [tool, setTool] = useState<ToolType>('pen')
  const [shapeType, setShapeType] = useState<ShapeType>('rectangle')
  const [color, setColor] = useState<string>(DEFAULT_ANNOTATION_COLORS[0]) // Vermelho
  const [strokeSizeId, setStrokeSizeId] = useState<StrokeSizeId>('medium')
  const [caption, setCaption] = useState<string>(initialCaption)
  const [isExporting, setIsExporting] = useState<boolean>(false)

  // Entrada de texto inline sobre a imagem
  const [textDraft, setTextDraft] = useState<{
    screenPosition: { left: number; top: number }
    canvasPosition: Point
    content: string
  } | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageElementRef = useRef<HTMLImageElement | null>(null)
  const isPointerDownRef = useRef<boolean>(false)
  const pointerStartRef = useRef<Point | null>(null)
  const currentPointsRef = useRef<Point[]>([])
  const textInputRef = useRef<HTMLTextAreaElement>(null)

  useEscapeClose(onClose)

  // Carrega a imagem a partir do arquivo
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imageElementRef.current = img
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.src = objectUrl

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  // Ajusta dimensões do palco para redimensionamento responsivo
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const updateSize = () => {
      setStageBox({
        width: stage.clientWidth,
        height: stage.clientHeight,
      })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(stage)
    requestViewportSync()
    return () => observer.disconnect()
  }, [])

  // Foco no input de texto quando ativo
  useEffect(() => {
    if (textDraft) {
      textInputRef.current?.focus()
    }
  }, [textDraft])

  // Atalhos de teclado (Ctrl+Z para desfazer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (!e.shiftKey) {
          e.preventDefault()
          undo()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [actions])

  // Desfazer última anotação
  const undo = useCallback(() => {
    setActions((prev) => prev.slice(0, -1))
  }, [])

  // Limpar todas as anotações
  const clearAll = useCallback(() => {
    setActions([])
    setCurrentAction(null)
  }, [])

  // Confirma a adição do texto ativo à imagem
  const commitText = useCallback(() => {
    if (!textDraft || !imageSize) {
      setTextDraft(null)
      return
    }
    const clean = textDraft.content.trim()
    if (clean) {
      const fontSize = calculateFontSize(imageSize.width, imageSize.height, strokeSizeId)
      const action: AnnotationAction = {
        type: 'text',
        text: clean,
        color,
        fontSize,
        position: textDraft.canvasPosition,
      }
      setActions((prev) => [...prev, action])
    }
    setTextDraft(null)
  }, [textDraft, imageSize, strokeSizeId, color])

  // Calcula tamanho do canvas na tela preservando aspect ratio da foto original
  const canvasDisplaySize = (() => {
    if (!imageSize || stageBox.width <= 0 || stageBox.height <= 0) {
      return { width: 0, height: 0 }
    }
    const maxW = Math.max(100, stageBox.width - 24)
    const maxH = Math.max(100, stageBox.height - 24)
    const ratio = imageSize.width / imageSize.height
    let w = maxW
    let h = w / ratio
    if (h > maxH) {
      h = maxH
      w = h * ratio
    }
    return { width: Math.round(w), height: Math.round(h) }
  })()

  // Renderização do canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imageElementRef.current
    if (!canvas || !img || !imageSize) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Ajusta resolução interna para a resolução nativa da foto
    if (canvas.width !== imageSize.width || canvas.height !== imageSize.height) {
      canvas.width = imageSize.width
      canvas.height = imageSize.height
    }

    // Limpa e desenha a foto base
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    // Renderiza todas as anotações consolidadas
    renderAllAnnotations(ctx, actions)

    // Renderiza a anotação em andamento (traçado ao vivo)
    if (currentAction) {
      renderAnnotation(ctx, currentAction)
    }
  }, [actions, currentAction, imageSize, canvasDisplaySize])

  // Manipulação de eventos de ponteiro (mouse / touch)
  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !imageSize) return

    // Se já havia uma caixa de texto aberta, consolida
    if (textDraft) {
      commitText()
      return
    }

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const point = clientToCanvasPoint(e.clientX, e.clientY, rect, imageSize)

    if (tool === 'text') {
      setTextDraft({
        screenPosition: { left: e.clientX, top: e.clientY },
        canvasPosition: point,
        content: '',
      })
      return
    }

    canvas.setPointerCapture(e.pointerId)
    isPointerDownRef.current = true
    pointerStartRef.current = point
    currentPointsRef.current = [point]

    if (tool === 'pen') {
      const width = calculateStrokeWidth(imageSize.width, imageSize.height, strokeSizeId)
      setCurrentAction({
        type: 'pen',
        color,
        width,
        points: [point],
      })
    } else if (tool === 'highlighter') {
      const width = calculateHighlighterWidth(imageSize.width, imageSize.height, strokeSizeId)
      setCurrentAction({
        type: 'highlighter',
        color,
        width,
        points: [point],
      })
    } else if (tool === 'shape') {
      const width = calculateStrokeWidth(imageSize.width, imageSize.height, strokeSizeId)
      setCurrentAction({
        type: 'shape',
        shapeType,
        color,
        width,
        start: point,
        end: point,
      })
    }
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current || !canvasRef.current || !imageSize) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const point = clientToCanvasPoint(e.clientX, e.clientY, rect, imageSize)

    if (tool === 'pen' || tool === 'highlighter') {
      currentPointsRef.current.push(point)
      const width =
        tool === 'pen'
          ? calculateStrokeWidth(imageSize.width, imageSize.height, strokeSizeId)
          : calculateHighlighterWidth(imageSize.width, imageSize.height, strokeSizeId)

      setCurrentAction({
        type: tool,
        color,
        width,
        points: [...currentPointsRef.current],
      })
    } else if (tool === 'shape' && pointerStartRef.current) {
      const width = calculateStrokeWidth(imageSize.width, imageSize.height, strokeSizeId)
      setCurrentAction({
        type: 'shape',
        shapeType,
        color,
        width,
        start: pointerStartRef.current,
        end: point,
      })
    }
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current) return
    isPointerDownRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Ignora erro caso o ponteiro já tenha sido liberado
    }

    if (currentAction) {
      setActions((prev) => [...prev, currentAction])
      setCurrentAction(null)
    }
    pointerStartRef.current = null
    currentPointsRef.current = []
  }

  const handlePointerCancel = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    isPointerDownRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Ignora erro
    }
    setCurrentAction(null)
    pointerStartRef.current = null
    currentPointsRef.current = []
  }

  // Enviar a imagem com legenda diretamente
  const handleSend = async () => {
    if (!imageElementRef.current || isExporting) return
    if (textDraft) commitText()
    setIsExporting(true)
    try {
      const editedFile = await createAnnotatedFile(file, imageElementRef.current, actions)
      await onSend(editedFile, caption.trim())
      onClose()
    } catch (err) {
      console.error('Falha ao exportar/enviar imagem editada', err)
      setIsExporting(false)
    }
  }

  // Salvar a imagem editada apenas nos anexos pendentes
  const handleSaveDraft = async () => {
    if (!imageElementRef.current || isExporting) return
    if (textDraft) commitText()
    setIsExporting(true)
    try {
      const editedFile = await createAnnotatedFile(file, imageElementRef.current, actions)
      onSaveDraft?.(editedFile)
      onClose()
    } catch (err) {
      console.error('Falha ao salvar rascunho da imagem', err)
      setIsExporting(false)
    }
  }

  const handleCaptionSubmit = (e: FormEvent) => {
    e.preventDefault()
    void handleSend()
  }

  return (
    <div className="modal-overlay image-editor-overlay" onMouseDown={onClose}>
      <div
        className="image-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Editor de Imagem"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Barra de Ferramentas Superior */}
        <header className="image-editor-toolbar">
          <div className="image-editor-tool-group" role="radiogroup" aria-label="Ferramenta de edição">
            <button
              type="button"
              className={`image-editor-tool-btn ${tool === 'pen' ? 'active' : ''}`}
              onClick={() => {
                commitText()
                setTool('pen')
              }}
              title="Rabisco / Caneta livre"
              aria-label="Rabisco / Caneta livre"
              aria-checked={tool === 'pen'}
              role="radio"
            >
              <IconPencil size={18} />
            </button>

            <button
              type="button"
              className={`image-editor-tool-btn ${tool === 'highlighter' ? 'active' : ''}`}
              onClick={() => {
                commitText()
                setTool('highlighter')
              }}
              title="Marca-texto (translúcido)"
              aria-label="Marca-texto"
              aria-checked={tool === 'highlighter'}
              role="radio"
            >
              <IconHighlighter size={18} />
            </button>

            <button
              type="button"
              className={`image-editor-tool-btn ${tool === 'shape' && shapeType === 'rectangle' ? 'active' : ''}`}
              onClick={() => {
                commitText()
                setTool('shape')
                setShapeType('rectangle')
              }}
              title="Retângulo"
              aria-label="Retângulo"
              aria-checked={tool === 'shape' && shapeType === 'rectangle'}
              role="radio"
            >
              <IconSquare size={18} />
            </button>

            <button
              type="button"
              className={`image-editor-tool-btn ${tool === 'shape' && shapeType === 'circle' ? 'active' : ''}`}
              onClick={() => {
                commitText()
                setTool('shape')
                setShapeType('circle')
              }}
              title="Círculo"
              aria-label="Círculo"
              aria-checked={tool === 'shape' && shapeType === 'circle'}
              role="radio"
            >
              <IconCircle size={18} />
            </button>

            <button
              type="button"
              className={`image-editor-tool-btn ${tool === 'shape' && shapeType === 'arrow' ? 'active' : ''}`}
              onClick={() => {
                commitText()
                setTool('shape')
                setShapeType('arrow')
              }}
              title="Seta apontadora"
              aria-label="Seta apontadora"
              aria-checked={tool === 'shape' && shapeType === 'arrow'}
              role="radio"
            >
              <IconArrowRight size={18} />
            </button>

            <button
              type="button"
              className={`image-editor-tool-btn ${tool === 'text' ? 'active' : ''}`}
              onClick={() => setTool('text')}
              title="Inserir texto"
              aria-label="Inserir texto"
              aria-checked={tool === 'text'}
              role="radio"
            >
              <IconType size={18} />
            </button>
          </div>

          <div className="image-editor-divider" />

          {/* Seletor de Espessura */}
          <div className="image-editor-size-group" role="radiogroup" aria-label="Espessura do traço">
            {STROKE_WIDTH_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`image-editor-size-btn ${strokeSizeId === opt.id ? 'active' : ''}`}
                onClick={() => setStrokeSizeId(opt.id)}
                title={`Traço ${opt.label}`}
                aria-label={`Traço ${opt.label}`}
                aria-checked={strokeSizeId === opt.id}
                role="radio"
              >
                <span className={`stroke-dot dot-${opt.id}`} />
              </button>
            ))}
          </div>

          <div className="image-editor-divider" />

          {/* Paleta de Cores */}
          <div className="image-editor-palette" role="radiogroup" aria-label="Cor do traço">
            {DEFAULT_ANNOTATION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`image-editor-color-btn ${color === c ? 'active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
                title={`Cor ${c}`}
                aria-label={`Cor ${c}`}
                aria-checked={color === c}
                role="radio"
              />
            ))}
          </div>

          <div className="image-editor-divider" />

          {/* Ações: Desfazer e Limpar */}
          <div className="image-editor-actions-group">
            <button
              type="button"
              className="image-editor-tool-btn"
              onClick={undo}
              disabled={actions.length === 0}
              title="Desfazer (Ctrl+Z)"
              aria-label="Desfazer"
            >
              <IconRotateCcw size={18} />
            </button>

            <button
              type="button"
              className="image-editor-tool-btn"
              onClick={clearAll}
              disabled={actions.length === 0}
              title="Limpar todas as anotações"
              aria-label="Limpar anotações"
            >
              <IconTrash size={18} />
            </button>
          </div>

          <button
            type="button"
            className="image-editor-close-btn"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar editor"
          >
            <IconX size={20} />
          </button>
        </header>

        {/* Palco Central do Canvas */}
        <main className="image-editor-stage" ref={stageRef}>
          {imageSize && (
            <div
              className="image-editor-canvas-wrap"
              style={{
                width: canvasDisplaySize.width,
                height: canvasDisplaySize.height,
              }}
            >
              <canvas
                ref={canvasRef}
                className={`image-editor-canvas tool-${tool}`}
                style={{
                  width: canvasDisplaySize.width,
                  height: canvasDisplaySize.height,
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
              />

              {/* Caixa de Entrada de Texto Inline */}
              {textDraft && (
                <div
                  className="image-editor-text-overlay"
                  style={{
                    left: Math.max(10, Math.min(canvasDisplaySize.width - 240, textDraft.screenPosition.left - (stageRef.current?.getBoundingClientRect().left ?? 0))),
                    top: Math.max(10, Math.min(canvasDisplaySize.height - 90, textDraft.screenPosition.top - (stageRef.current?.getBoundingClientRect().top ?? 0))),
                  }}
                >
                  <textarea
                    ref={textInputRef}
                    className="image-editor-text-input"
                    rows={2}
                    value={textDraft.content}
                    placeholder="Digite o texto…"
                    style={{ color }}
                    onChange={(e) => setTextDraft({ ...textDraft, content: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        commitText()
                      }
                      if (e.key === 'Escape') {
                        setTextDraft(null)
                      }
                    }}
                  />
                  <div className="image-editor-text-actions">
                    <button
                      type="button"
                      className="image-editor-text-ok"
                      onClick={commitText}
                      title="Adicionar texto"
                      aria-label="Confirmar texto"
                    >
                      <IconCheck size={16} />
                    </button>
                    <button
                      type="button"
                      className="image-editor-text-cancel"
                      onClick={() => setTextDraft(null)}
                      title="Cancelar texto"
                      aria-label="Cancelar texto"
                    >
                      <IconX size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Rodapé: Campo de Legenda e Envio */}
        <footer className="image-editor-footer">
          <form className="image-editor-caption-form" onSubmit={handleCaptionSubmit}>
            <input
              type="text"
              className="image-editor-caption-input"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Adicionar uma legenda…"
              disabled={isExporting}
              autoFocus
            />

            <div className="image-editor-footer-buttons">
              {onSaveDraft && (
                <button
                  type="button"
                  className="image-editor-secondary-btn"
                  onClick={handleSaveDraft}
                  disabled={isExporting}
                >
                  Salvar nos anexos
                </button>
              )}

              <button
                type="button"
                className="image-editor-cancel-btn"
                onClick={onClose}
                disabled={isExporting}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="image-editor-send-btn"
                disabled={isExporting}
                aria-label="Enviar foto anotada"
              >
                <IconSend size={16} />
                <span>{isExporting ? 'Processando…' : 'Enviar'}</span>
              </button>
            </div>
          </form>
        </footer>
      </div>
    </div>
  )
}

export default ImageEditorModal

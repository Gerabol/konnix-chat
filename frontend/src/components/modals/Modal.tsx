import { useEffect, useRef } from 'react'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import { requestViewportSync } from '../../hooks/useMobileViewport'

let modalToastDismiss: (() => void) | null = null

export function registerModalToastDismiss(fn: (() => void) | null) {
  modalToastDismiss = fn
}

export function dismissModalToast() {
  if (modalToastDismiss) modalToastDismiss()
}

export function Modal({
  title,
  onClose,
  children,
  className = '',
  overlayClassName = '',
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  className?: string
  overlayClassName?: string
}) {
  const titleId = `modal-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const closeRef = useRef<HTMLButtonElement>(null)
  useEscapeClose(onClose)
  useEffect(() => {
    // Blur any focused input so the virtual keyboard closes behind the modal;
    // otherwise modals opened near the composer render short/high up against
    // the keyboard-reduced --app-height.
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body && !active.closest('.modal')) {
      active.blur()
    }
    closeRef.current?.focus()
    requestViewportSync()
  }, [])
  useEffect(() => () => dismissModalToast(), [])

  return (
    <div className={`modal-overlay ${overlayClassName}`} onMouseDown={onClose}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  )
}

export default Modal

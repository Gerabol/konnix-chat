import { useEffect, useRef, useState } from 'react'
import { formatBytes } from '../../api'
import type { Room } from '../../api'
import { IconClip, IconCode, IconMic, IconPlus, IconStop, IconTrash, IconX } from '../icons'

export function ComposerPendingAttachments({
  files,
  urls,
  onRemove,
}: {
  files: File[]
  urls: string[]
  onRemove: (index: number) => void
}) {
  if (files.length === 0) return null
  const hasImage = files.some((file) => file.type.startsWith('image/'))
  return (
    <div className={`composer-pending-attachments ${hasImage ? 'has-image' : ''}`} data-composer-pending-attachments aria-label="Anexos pendentes">
      {files.map((file, index) => {
        const image = file.type.startsWith('image/') && urls[index]
        return image ? (
          <div className="composer-pending-attachment composer-pending-image" key={`${file.name}-${file.lastModified}-${index}`}>
            <div className="composer-pending-preview">
              <img src={urls[index]} alt={`Prévia de ${file.name}`} />
            </div>
            <span className="composer-pending-name" title={file.name}>{file.name}</span>
            <button className="composer-pending-remove" type="button" onClick={() => onRemove(index)} aria-label={`Remover ${file.name}`}>×</button>
          </div>
        ) : (
          <div className="composer-pending-attachment composer-pending-file" key={`${file.name}-${file.lastModified}-${index}`}>
            <span className="composer-pending-icon" aria-hidden="true">📎</span>
            <span className="composer-pending-details" title={file.name}><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>
            <button className="composer-pending-remove" type="button" onClick={() => onRemove(index)} aria-label={`Remover ${file.name}`}>×</button>
          </div>
        )
      })}
    </div>
  )
}

export function ComposerActionBox({
  roomType,
  readOnlyAccount,
  roomReadOnly,
  muted,
  clearDisabled,
  editing,
  recordingAudio,
  onAttach,
  onRecordAudio,
  onCode,
  onPoll,
  onClear,
  onCancelEdit,
}: {
  roomType: Room['type']
  readOnlyAccount: boolean
  roomReadOnly: boolean
  muted: boolean
  clearDisabled: boolean
  editing: boolean
  recordingAudio: boolean
  onAttach: () => void
  onRecordAudio: () => void
  onCode: () => void
  onPoll: () => void
  onClear: () => void
  onCancelEdit: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const showPoll = roomType === 'PRIVATE_GROUP' && !readOnlyAccount && !roomReadOnly

  return (
    <div className="composer-action-box" ref={ref}>
      <button
        type="button"
        className="composer-action-trigger"
        aria-label="Mais ações"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Mais ações"
        disabled={muted}
        onClick={() => setOpen((o) => !o)}
      >
        <IconPlus size={22} />
      </button>
      {open && (
        <div className="composer-actions-popover" role="menu" aria-label="Mais ações">
          <button type="button" role="menuitem" className="composer-action-box-item" onClick={() => { onAttach(); setOpen(false) }} disabled={muted}>
            <span className="composer-action-box-icon"><IconClip size={18} /></span>
            <span>Anexar Arquivo</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={`composer-action-box-item ${recordingAudio ? 'composer-action-box-item-recording' : ''}`}
            onClick={() => { onRecordAudio(); setOpen(false) }}
            disabled={muted}
          >
            <span className="composer-action-box-icon">
              {recordingAudio ? <IconStop size={18} /> : <IconMic size={18} />}
            </span>
            <span>{recordingAudio ? 'Parar Gravação' : 'Gravar Áudio'}</span>
          </button>
          <button type="button" role="menuitem" className="composer-action-box-item" onClick={() => { onCode(); setOpen(false) }} disabled={muted}>
            <span className="composer-action-box-icon"><IconCode size={18} /></span>
            <span>Bloco de Código</span>
          </button>
          {showPoll && (
            <button type="button" role="menuitem" className="composer-action-box-item" onClick={() => { onPoll(); setOpen(false) }}>
              <span className="composer-action-box-icon"><span aria-hidden="true">▣</span></span>
              <span>Criar Enquete</span>
            </button>
          )}
          <button type="button" role="menuitem" className="composer-action-box-item composer-action-box-item-danger" onClick={() => { onClear(); setOpen(false) }} disabled={clearDisabled}>
            <span className="composer-action-box-icon"><IconTrash size={18} /></span>
            <span>Limpar Mensagem</span>
          </button>
          {editing && (
            <button type="button" role="menuitem" className="composer-action-box-item" onClick={() => { onCancelEdit(); setOpen(false) }} disabled={muted}>
              <span className="composer-action-box-icon"><IconX size={18} /></span>
              <span>Cancelar Edição</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

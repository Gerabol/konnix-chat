import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { api, ApiError } from '../../api'
import type { Message } from '../../api'
import { useEscapeClose } from '../../hooks/useEscapeClose'

export function ReportIssueModal({
  onClose,
  notify,
}: {
  onClose: () => void
  notify: (text: string) => void
}) {
  useEscapeClose(onClose)
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    setFiles((prev) => [...prev, ...selectedFiles])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = async () => {
    if (!content.trim() || busy) return
    setBusy(true)
    try {
      await api.reportIssue(content.trim(), files.length > 0 ? files : undefined)
      notify('Relato enviado com sucesso aos administradores!')
      onClose()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Falha ao enviar relato')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal">
        <div className="modal-head">
          <h3>Relatar Problema</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="modal-fields">
          <label className="admin-label">
            Descreva a sugestão ou bug
            <textarea
              className="input"
              style={{ minHeight: '120px', resize: 'vertical', fontFamily: 'inherit', padding: '8px' }}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Digite detalhadamente o problema ou sugestão..."
              maxLength={2000}
            />
          </label>
          <div className="report-attachments">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar"
            />
            <button
              type="button"
              className="btn-ghost report-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              Anexar arquivo
            </button>
            {files.length > 0 && (
              <div className="report-file-list">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="report-file-item">
                    <span className="report-file-name">{file.name}</span>
                    <button
                      type="button"
                      className="report-file-remove"
                      onClick={() => removeFile(index)}
                      disabled={busy}
                      aria-label={`Remover ${file.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn-primary" disabled={busy || !content.trim()} onClick={submit}>
            {busy ? 'Enviando...' : 'Enviar relato'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function RespondToReportModal({
  message,
  onClose,
  onResponded,
  notify,
}: {
  message: Message
  onClose: () => void
  onResponded: () => void
  notify: (text: string) => void
}) {
  useEscapeClose(onClose)
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    setFiles((prev) => [...prev, ...selectedFiles])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = async () => {
    if (busy || (!content.trim() && files.length === 0)) return
    setBusy(true)
    try {
      await api.respondToReport(message.id, content.trim(), files.length > 0 ? files : undefined)
      notify('Resposta enviada por mensagem direta ao usuário')
      onResponded()
      onClose()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Falha ao enviar resposta')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal">
        <div className="modal-head">
          <h3>Responder ao relato</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="modal-fields">
          <div className="report-original-message">
            <strong>Relato original de {message.username || 'usuário'}:</strong>
            <span>{message.content || 'Anexo'}</span>
          </div>
          <label className="admin-label">
            Sua resposta (será enviada por DM)
            <textarea
              className="input"
              style={{ minHeight: '100px', resize: 'vertical', fontFamily: 'inherit', padding: '8px' }}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Digite a resposta ao relato..."
              maxLength={2000}
            />
          </label>
          <div className="report-attachments">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar"
            />
            <button
              type="button"
              className="btn-ghost report-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              Anexar arquivo
            </button>
            {files.length > 0 && (
              <div className="report-file-list">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="report-file-item">
                    <span className="report-file-name">{file.name}</span>
                    <button
                      type="button"
                      className="report-file-remove"
                      onClick={() => removeFile(index)}
                      disabled={busy}
                      aria-label={`Remover ${file.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn-primary" disabled={busy || (!content.trim() && files.length === 0)} onClick={submit}>
            {busy ? 'Enviando...' : 'Enviar resposta'}
          </button>
        </div>
      </div>
    </div>
  )
}

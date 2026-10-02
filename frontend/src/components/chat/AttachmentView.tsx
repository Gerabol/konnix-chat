import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, formatBytes, userAvatarPath } from '../../api'
import type { Attachment, Message } from '../../api'
import { ImageLightbox } from '../modals/ImageLightbox'
import { attachmentBlobCache } from '../../utils/attachmentCache'
import { AudioPlayer } from './AudioPlayer'

export function attachmentExtension(att: Attachment): string {
  return att.originalName.split('.').pop()?.toLowerCase() ?? ''
}

export function attachmentIconClass(att: Attachment): string {
  const ext = attachmentExtension(att)
  if (att.mimeType === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (['xls', 'xlsx', 'xlsm', 'ods'].includes(ext) || att.mimeType.includes('spreadsheet')) return 'spreadsheet'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || att.mimeType.includes('word')) return 'document'
  if (['ppt', 'pptx', 'odp'].includes(ext) || att.mimeType.includes('presentation')) return 'presentation'
  if (att.mimeType.startsWith('audio/')) return 'audio'
  return 'generic'
}

export function attachmentIcon(att: Attachment, isImage: boolean, isAudio: boolean): string {
  if (isImage) return '🖼'
  if (isAudio) return '🎵'
  const kind = attachmentIconClass(att)
  if (kind === 'pdf') return '📕'
  if (kind === 'spreadsheet') return '📊'
  if (kind === 'document') return '📄'
  if (kind === 'presentation') return '📽'
  return '📎'
}

export function AttachmentView({
  msg,
  authorAvatarPath,
}: {
  msg: Message
  authorAvatarPath?: string | null
}) {
  const att = msg.attachment
  const isImage = !!att && att.mimeType.startsWith('image/')
  const isAudio = !!att && att.mimeType.startsWith('audio/')
  const cachedUrl = att ? attachmentBlobCache.get(att.id) : undefined
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; url: string } | { status: 'error'; error: string }>(
    cachedUrl ? { status: 'ready', url: cachedUrl } : { status: 'loading' },
  )

  const load = useCallback(async () => {
    if (!att) return
    const cached = attachmentBlobCache.get(att.id)
    if (cached) {
      setState({ status: 'ready', url: cached })
      return
    }
    setState({ status: 'loading' })
    try {
      const blob = await api.downloadFile(att.id)
      const url = URL.createObjectURL(blob)
      attachmentBlobCache.set(att.id, url)
      setState({ status: 'ready', url })
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof ApiError ? err.message : 'Falha ao carregar o anexo',
      })
    }
  }, [att])

  useEffect(() => {
    if (att && !attachmentBlobCache.has(att.id)) {
      load()
    } else if (att && attachmentBlobCache.has(att.id)) {
      const cached = attachmentBlobCache.get(att.id)!
      setState((prev) => (prev.status === 'ready' && prev.url === cached ? prev : { status: 'ready', url: cached }))
    }
  }, [att, load])

  if (!att) return null

  if (state.status === 'loading') {
    return (
      <div className="attachment">
        <span className={`attachment-icon ${attachmentIconClass(att)}`}>{attachmentIcon(att, isImage, isAudio)}</span>
        <span className="attachment-body">
          <strong>{att.originalName}</strong>
          <small>Carregando…</small>
        </span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="attachment attachment-error">
        <span className={`attachment-icon ${attachmentIconClass(att)}`}>⚠</span>
        <span className="attachment-body">
          <strong>{att.originalName}</strong>
          <small className="attachment-errmsg">{state.error}</small>
          <button className="attachment-retry" onClick={load}>
            Tentar novamente
          </button>
        </span>
      </div>
    )
  }

  if (isImage) {
    return (
      <div className="attachment-image">
        <button
          type="button"
          className="attachment-img-btn"
          onClick={() => setLightboxOpen(true)}
          title="Clique para ampliar"
          aria-label={`Ampliar imagem ${att.originalName}`}
        >
          <img src={state.url} alt={att.originalName} className="attachment-img" />
        </button>
        <span className="attachment-image-meta">
          <strong>{att.originalName}</strong>
          <small>{formatBytes(att.size)}</small>
          <a href={state.url} download={att.originalName} className="btn-link">
            Baixar
          </a>
        </span>
        {lightboxOpen && (
          <ImageLightbox src={state.url} alt={att.originalName} onClose={() => setLightboxOpen(false)} />
        )}
      </div>
    )
  }

  if (isAudio) {
    const avatarPath =
      authorAvatarPath !== undefined
        ? authorAvatarPath
        : msg.userId
        ? userAvatarPath(msg.userId)
        : null

    return (
      <AudioPlayer
        src={state.url}
        authorName={msg.username || 'sistema'}
        authorAvatarPath={avatarPath}
        fileSize={att.size}
        fileName={att.originalName}
      />
    )
  }

  return (
    <a href={state.url} download={att.originalName} className="attachment">
      <span className={`attachment-icon ${attachmentIconClass(att)}`}>{attachmentIcon(att, false, false)}</span>
      <span className="attachment-body">
        <strong>{att.originalName}</strong>
        <small>
          {formatBytes(att.size)} • {att.mimeType} — Baixar
        </small>
      </span>
    </a>
  )
}

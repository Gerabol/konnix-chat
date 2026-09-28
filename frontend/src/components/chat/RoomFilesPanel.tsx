import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { RoomFile } from '../../api'
import { saveDownloadedBlob } from '../../platform'
import { attachmentBlobCache } from '../../utils/attachmentCache'
import { IconClip, IconDownload } from '../icons'
import { attachmentIcon, attachmentIconClass } from './AttachmentView'

export function formatFileDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function FileThumbnail({ file }: { file: RoomFile }) {
  const isImage = file.mimeType?.startsWith('image/')
  const cached = isImage ? attachmentBlobCache.get(file.id) : undefined
  const [url, setUrl] = useState<string | null>(cached ?? null)

  useEffect(() => {
    if (!isImage) return
    const cachedUrl = attachmentBlobCache.get(file.id)
    if (cachedUrl) {
      setUrl(cachedUrl)
      return
    }
    let active = true
    api.downloadFile(file.id).then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      attachmentBlobCache.set(file.id, objectUrl)
      if (active) setUrl(objectUrl)
    }).catch(() => setUrl(null))
    return () => {
      active = false
    }
  }, [file.id, isImage])

  if (isImage && url) return <img className="room-file-thumb" src={url} alt="" />
  return (
    <span className={`room-file-thumb room-file-icon ${attachmentIconClass(file)}`}>
      {attachmentIcon(file, false, false)}
    </span>
  )
}

export function RoomFileItem({ file }: { file: RoomFile }) {
  const download = async () => {
    try {
      const blob = await api.downloadFile(file.id)
      if (await saveDownloadedBlob(blob, file.originalName)) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.originalName
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      // O item permanece disponível mesmo quando o download falha.
    }
  }

  return (
    <article className="room-file-item">
      <FileThumbnail file={file} />
      <div className="room-file-info">
        <strong title={file.originalName}>{file.originalName}</strong>
        <small>{file.name ? file.name : `@${file.username}`}</small>
        <time dateTime={file.createdAt}>{formatFileDate(file.createdAt)}</time>
      </div>
      <button
        type="button"
        className="room-file-action"
        onClick={() => void download()}
        aria-label={`Baixar ${file.originalName}`}
        title="Baixar arquivo"
      >
        <IconDownload size={16} />
      </button>
    </article>
  )
}

export function RoomFilesPanel({
  files,
  loading,
  error,
  query,
  type,
  onQueryChange,
  onTypeChange,
  onClose,
  onRetry,
}: {
  files: RoomFile[]
  loading: boolean
  error: string | null
  query: string
  type: string
  onQueryChange: (value: string) => void
  onTypeChange: (value: string) => void
  onClose: () => void
  onRetry: () => void
}) {
  return (
    <aside className="room-files-panel" aria-label="Arquivos da conversa">
      <div className="room-files-head">
        <h3><IconClip size={18} /> Arquivos</h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar arquivos">×</button>
      </div>
      <div className="room-files-filters">
        <input
          className="input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Pesquisar arquivos"
          aria-label="Pesquisar arquivos"
        />
        <select
          className="input"
          value={type}
          onChange={(event) => onTypeChange(event.target.value)}
          aria-label="Filtrar arquivos por tipo"
        >
          <option value="ALL">Todos</option>
          <option value="IMAGES">Imagens</option>
          <option value="DOCUMENTS">Documentos</option>
          <option value="AUDIO">Áudios</option>
          <option value="VIDEO">Vídeos</option>
        </select>
      </div>
      <div className="room-files-list">
        {loading && <div className="room-files-empty">Carregando arquivos…</div>}
        {!loading && error && (
          <div className="room-files-empty room-files-error">
            <span>{error}</span>
            <button type="button" className="btn-link" onClick={onRetry}>Tentar novamente</button>
          </div>
        )}
        {!loading && !error && files.length === 0 && <div className="room-files-empty">Nenhum arquivo encontrado.</div>}
        {!loading && files.map((file) => <RoomFileItem file={file} key={file.id} />)}
      </div>
    </aside>
  )
}

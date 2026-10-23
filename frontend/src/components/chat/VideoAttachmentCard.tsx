import type { Attachment } from '../../api'
import { formatBytes } from '../../api'
import { IconDownload } from '../icons'

export function VideoAttachmentCard({
  att,
  url,
  onOpen,
}: {
  att: Attachment
  url: string
  onOpen: () => void
}) {
  return (
    <div className="video-attachment-card">
      <button
        type="button"
        className="video-card-thumb-wrapper"
        onClick={onOpen}
        title="Clique para reproduzir vídeo"
        aria-label={`Reproduzir vídeo ${att.originalName}`}
      >
        <video
          src={`${url}#t=0.1`}
          className="video-card-thumb"
          preload="metadata"
          muted
          playsInline
        />
        <div className="video-card-play-overlay" aria-hidden="true">
          <span className="video-card-play-btn">▶</span>
        </div>
      </button>
      <div className="video-card-meta">
        <div className="video-card-info">
          <strong title={att.originalName}>{att.originalName}</strong>
          <small>{formatBytes(att.size)}</small>
        </div>
        <a
          href={url}
          download={att.originalName}
          className="video-card-download"
          title={`Baixar ${att.originalName}`}
          aria-label={`Baixar vídeo ${att.originalName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <IconDownload size={15} />
        </a>
      </div>
    </div>
  )
}

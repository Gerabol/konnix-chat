import { useMemo } from 'react'
import type { FavoriteMessage } from '../../api'
import { formatFileDate } from './RoomFilesPanel'
import { IconHeart, IconTrash, IconX } from '../icons'

export function RoomFavoritesPanel({
  favorites,
  loading,
  error,
  query,
  onQueryChange,
  onClose,
  onRetry,
  onJumpToMessage,
  onRemoveFavorite,
}: {
  favorites: FavoriteMessage[]
  loading: boolean
  error: string | null
  query: string
  onQueryChange: (value: string) => void
  onClose: () => void
  onRetry: () => void
  onJumpToMessage: (messageId: string) => void
  onRemoveFavorite: (messageId: string) => void
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return favorites
    return favorites.filter((fav) => {
      const content = fav.message.content?.toLowerCase() ?? ''
      const author = fav.message.username?.toLowerCase() ?? ''
      const attachmentName = fav.message.attachment?.originalName?.toLowerCase() ?? ''
      const pollQuestion = fav.message.poll?.question?.toLowerCase() ?? ''
      return (
        content.includes(q) ||
        author.includes(q) ||
        attachmentName.includes(q) ||
        pollQuestion.includes(q)
      )
    })
  }, [favorites, query])

  return (
    <aside className="room-files-panel room-favorites-panel" aria-label="Mensagens favoritas da conversa">
      <div className="room-files-head">
        <h3>
          <IconHeart size={18} filled /> Mensagens favoritas
        </h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar favoritas">
          <IconX size={18} />
        </button>
      </div>

      <div className="room-files-filters">
        <input
          className="input"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Pesquisar nas favoritas"
          aria-label="Pesquisar nas favoritas"
        />
      </div>

      <div className="room-files-list">
        {loading && <div className="room-files-empty">Carregando favoritas…</div>}
        {!loading && error && (
          <div className="room-files-empty room-files-error">
            <span>{error}</span>
            <button type="button" className="btn-link" onClick={onRetry}>
              Tentar novamente
            </button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="room-files-empty">
            {query.trim() ? 'Nenhuma mensagem encontrada.' : 'Nenhuma mensagem favoritada nesta conversa.'}
          </div>
        )}
        {!loading &&
          !error &&
          filtered.map((fav) => {
            const msg = fav.message
            const previewText = msg.content
              ? msg.content
              : msg.attachment
                ? `📎 ${msg.attachment.originalName || 'Anexo'}`
                : msg.poll
                  ? `📊 Enquete: ${msg.poll.question}`
                  : 'Mensagem'

            return (
              <article
                key={fav.favoriteId}
                className="room-favorite-item"
                onClick={() => onJumpToMessage(msg.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onJumpToMessage(msg.id)
                  }
                }}
              >
                <div className="room-favorite-item-content">
                  <div className="room-favorite-item-header">
                    <span className="room-favorite-author">{msg.username || 'sistema'}</span>
                    <span className="room-favorite-date">{formatFileDate(msg.createdAt)}</span>
                  </div>
                  <p className="room-favorite-snippet">{previewText}</p>
                </div>
                <button
                  type="button"
                  className="room-favorite-remove-btn icon-btn"
                  title="Desfavoritar mensagem"
                  aria-label="Desfavoritar mensagem"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveFavorite(msg.id)
                  }}
                >
                  <IconTrash size={15} />
                </button>
              </article>
            )
          })}
      </div>
    </aside>
  )
}

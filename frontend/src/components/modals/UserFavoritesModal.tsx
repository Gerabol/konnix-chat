import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../api'
import type { FavoriteMessage } from '../../api'
import { Modal } from './Modal'
import { formatFileDate } from '../chat/RoomFilesPanel'
import { IconHeart, IconSearch, IconTrash } from '../icons'

export function UserFavoritesModal({
  onClose,
  onSelectRoom,
  notify,
}: {
  onClose: () => void
  onSelectRoom: (roomId: string, messageId: string) => void
  notify?: (text: string, anchor?: 'content' | 'modal') => void
}) {
  const [favorites, setFavorites] = useState<FavoriteMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const loadFavorites = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getFavoriteMessages()
      setFavorites(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar mensagens favoritas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFavorites()
  }, [])

  const handleRemoveFavorite = async (messageId: string) => {
    try {
      await api.removeMessageFavorite(messageId)
      setFavorites((prev) => prev.filter((fav) => fav.message.id !== messageId))
      notify?.('Mensagem removida dos favoritos', 'modal')
    } catch (err) {
      notify?.(err instanceof ApiError ? err.message : 'Erro ao remover favorito', 'modal')
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return favorites
    return favorites.filter((fav) => {
      const content = fav.message.content?.toLowerCase() ?? ''
      const author = fav.message.username?.toLowerCase() ?? ''
      const room = fav.roomName?.toLowerCase() ?? ''
      const attachment = fav.message.attachment?.originalName?.toLowerCase() ?? ''
      const poll = fav.message.poll?.question?.toLowerCase() ?? ''
      return (
        content.includes(q) ||
        author.includes(q) ||
        room.includes(q) ||
        attachment.includes(q) ||
        poll.includes(q)
      )
    })
  }, [favorites, query])

  const formatRoomBadge = (fav: FavoriteMessage) => {
    if (fav.roomType === 'DIRECT') return `@${fav.roomName}`
    if (fav.roomType === 'CHANNEL') return `#${fav.roomName}`
    return `🔒 ${fav.roomName}`
  }

  return (
    <Modal title="Mensagens Favoritas" onClose={onClose} className="user-favorites-modal">
      <div className="user-favorites-filters">
        <div className="user-favorites-search-wrap">
          <IconSearch size={16} />
          <input
            className="input user-favorites-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar por mensagem, pessoa ou conversa..."
            aria-label="Pesquisar nas mensagens favoritas"
            autoFocus
          />
        </div>
      </div>

      <div className="user-favorites-list">
        {loading && <div className="user-favorites-empty">Carregando mensagens favoritas…</div>}

        {!loading && error && (
          <div className="user-favorites-empty user-favorites-error">
            <span>{error}</span>
            <button type="button" className="btn-link" onClick={() => void loadFavorites()}>
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="user-favorites-empty">
            <IconHeart size={32} />
            <p>
              {query.trim()
                ? 'Nenhuma mensagem encontrada para a busca.'
                : 'Você ainda não possui mensagens favoritas.'}
            </p>
            {!query.trim() && (
              <small>
                Passe o cursor sobre qualquer mensagem e clique no coração para salvá-la aqui.
              </small>
            )}
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
                className="user-favorite-card"
                onClick={() => onSelectRoom(fav.roomId, msg.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectRoom(fav.roomId, msg.id)
                  }
                }}
              >
                <div className="user-favorite-card-main">
                  <div className="user-favorite-card-meta">
                    <span className="user-favorite-room-badge" title={fav.roomName}>
                      {formatRoomBadge(fav)}
                    </span>
                    <span className="user-favorite-card-author">{msg.username || 'sistema'}</span>
                    <span className="user-favorite-card-date">{formatFileDate(msg.createdAt)}</span>
                  </div>
                  <p className="user-favorite-card-text">{previewText}</p>
                </div>
                <button
                  type="button"
                  className="icon-btn user-favorite-remove-btn"
                  title="Desfavoritar mensagem"
                  aria-label="Desfavoritar mensagem"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleRemoveFavorite(msg.id)
                  }}
                >
                  <IconTrash size={16} />
                </button>
              </article>
            )
          })}
      </div>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  )
}

export default UserFavoritesModal

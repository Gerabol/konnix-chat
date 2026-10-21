import { useEffect, useState } from 'react'
import { api, formatFullTimestamp, formatTime, userAvatarPath } from '../../api'
import type { Message, MessageReaction, ReadReceipt } from '../../api'
import { Modal } from './Modal'
import { AvatarImage, initials } from '../chat/AvatarImage'
import { formatReaderCount, readerDisplayName, sortReadersByDate } from '../../utils/readReceipts'

export function ReadReceiptsModal({
  message,
  onClose,
}: {
  message: Message
  onClose: () => void
}) {
  const [readers, setReaders] = useState<ReadReceipt[]>(() =>
    sortReadersByDate(message.readBy ?? []),
  )
  const [loading, setLoading] = useState(readers.length === 0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .messageReaders(message.id)
      .then((data) => {
        if (active) {
          setReaders(sortReadersByDate(data))
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          if (readers.length === 0) {
            setError('Não foi possível carregar as leituras.')
          }
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [message.id])

  const countLabel = readers.length > 0 ? formatReaderCount(readers.length) : null

  return (
    <Modal title="Visualizar leitura" onClose={onClose} className="read-receipts-modal">
      {countLabel && (
        <div className="read-receipts-summary">
          <small>{countLabel}</small>
        </div>
      )}
      <div className="read-receipts-list">
        {loading && readers.length === 0 && (
          <span className="nav-empty">Carregando confirmações de leitura…</span>
        )}
        {!loading && error && <span className="nav-empty notif-error">{error}</span>}
        {!loading && !error && readers.length === 0 && (
          <span className="nav-empty">Ainda não lida por outra pessoa.</span>
        )}
        {readers.map((reader) => {
          const displayName = readerDisplayName(reader)
          return (
            <div className="read-receipt-row" key={`${reader.userId}-${reader.readAt}`}>
              <AvatarImage
                path={userAvatarPath(reader.userId)}
                className="mini-avatar"
                fallback={<span className="mini-avatar">{initials(displayName)}</span>}
                alt={displayName}
              />
              <span className="picker-item-text">
                <strong>{displayName}</strong>
                <small>@{reader.username}</small>
              </span>
              <time dateTime={reader.readAt} title={formatFullTimestamp(reader.readAt)}>
                {formatTime(reader.readAt)}
              </time>
            </div>
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

export function ReactionUsersModal({
  emoji,
  reactions,
  onClose,
}: {
  emoji: string
  reactions: MessageReaction[]
  onClose: () => void
}) {
  return (
    <Modal title={`Quem reagiu com ${emoji}`} onClose={onClose} className="reaction-users-modal">
      <div className="reaction-users-list">
        {reactions.map((reaction) => (
          <div className="read-receipt-row" key={`${reaction.userId}-${reaction.createdAt ?? reaction.id ?? reaction.emoji}`}>
            <span className="mini-avatar">{initials(reaction.username)}</span>
            <span className="picker-item-text">
              <strong>{reaction.username}</strong>
              <small>{reaction.emoji}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  )
}

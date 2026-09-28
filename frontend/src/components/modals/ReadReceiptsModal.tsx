import { formatTime, userAvatarPath } from '../../api'
import type { Message, MessageReaction } from '../../api'
import { Modal } from './Modal'
import { AvatarImage, initials } from '../chat/AvatarImage'

export function ReadReceiptsModal({
  message,
  onClose,
}: {
  message: Message
  onClose: () => void
}) {
  const readers = message.readBy ?? []
  return (
    <Modal title="Confirmação de leitura" onClose={onClose} className="read-receipts-modal">
      <div className="read-receipts-list">
        {readers.length === 0 && <span className="nav-empty">Ainda não lida por outra pessoa.</span>}
        {readers.map((reader) => (
          <div className="read-receipt-row" key={`${reader.userId}-${reader.readAt}`}>
            <AvatarImage
              path={userAvatarPath(reader.userId)}
              className="mini-avatar"
              fallback={<span className="mini-avatar">{initials(reader.name || reader.username)}</span>}
              alt={reader.name || reader.username}
            />
            <span className="picker-item-text">
              <strong>{reader.name || reader.username}</strong>
              <small>@{reader.username}</small>
            </span>
            <time dateTime={reader.readAt}>{formatTime(reader.readAt)}</time>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Fechar</button>
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

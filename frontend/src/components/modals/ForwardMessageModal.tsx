import { useEffect, useState } from 'react'
import { api, ApiError, userAvatarPath } from '../../api'
import type { DirectoryUser, Message, Room } from '../../api'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import { ROOM_ICON, roomDisplayName } from '../../utils/room'
import { AvatarImage, initials } from '../chat/AvatarImage'

export function ForwardMessageModal({
  message,
  rooms,
  onClose,
  notify,
}: {
  message: Message
  rooms: Room[]
  onClose: () => void
  notify: (text: string) => void
}) {
  useEscapeClose(onClose)
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<(typeof candidates)[number] | null>(null)

  useEffect(() => {
    api.userDirectory().then(setUsers).catch(() => setUsers([]))
  }, [])

  const normalizedQuery = query.trim().toLowerCase()
  const candidates = [
    ...users
      .filter((user) => `${user.name} ${user.username}`.toLowerCase().includes(normalizedQuery))
      .map((user) => ({
        type: 'user' as const,
        id: user.id,
        name: user.name || user.username,
        subtitle: `@${user.username}`,
        user,
      })),
    ...rooms
      .filter((room) => room.type === 'CHANNEL' || room.type === 'PRIVATE_GROUP' || room.type === 'PUBLIC_GROUP')
      .filter((room) => `${roomDisplayName(room)} ${room.name}`.toLowerCase().includes(normalizedQuery))
      .map((room) => ({
        type: 'room' as const,
        id: room.id,
        name: roomDisplayName(room),
        subtitle: room.type === 'CHANNEL' ? 'Canal' : 'Grupo',
        room,
      })),
  ].slice(0, 20)

  const forward = async (destination: (typeof candidates)[number]) => {
    setBusy(true)
    try {
      const roomId = destination.type === 'user' ? (await api.createDm(destination.id)).id : destination.id
      await api.sendMessage(
        roomId,
        message.content || `Anexo encaminhado: ${message.attachment?.originalName || 'arquivo'}`,
        undefined,
        message.id
      )
      notify(`Mensagem encaminhada para ${destination.name}`)
      onClose()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Falha ao encaminhar mensagem')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal forward-modal">
        <div className="modal-head">
          <h3>Encaminhar mensagem</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <input
          autoComplete="off"
          className="input"
          placeholder="Pesquisar pessoa, grupo ou canal"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="forward-list">
          {candidates.map((destination) => {
        const isSelected = selected?.id === destination.id && selected?.type === destination.type
        return (
          <button
            type="button"
            className={`forward-user${isSelected ? ' selected' : ''}`}
            disabled={busy}
            key={`${destination.type}-${destination.id}`}
            onClick={() => setSelected(destination)}
          >
            {destination.type === 'user' ? (
              <AvatarImage
                path={userAvatarPath(destination.id)}
                className="admin-member-avatar"
                fallback={<span className="admin-member-avatar">{initials(destination.name)}</span>}
                alt={destination.name}
              />
            ) : (
              <span className="admin-member-avatar forward-room-icon" aria-hidden="true">
                {ROOM_ICON[destination.room.type] ?? '#'}
              </span>
            )}
            <span>
              <strong>{destination.name}</strong>
              <small>{destination.subtitle}</small>
            </span>
          </button>
        )
      })}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={busy || !selected} onClick={() => selected && void forward(selected)}>{busy ? 'Enviando…' : 'Enviar'}</button>
        </div>
      </div>
    </div>
  )
}

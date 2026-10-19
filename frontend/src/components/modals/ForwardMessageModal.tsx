import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../api'
import type { DirectoryUser, Message, Room } from '../../api'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import { getForwardCandidates } from '../../utils/forward'
import type { ForwardCandidate } from '../../utils/forward'
import { AvatarImage } from '../chat/AvatarImage'

export interface ForwardMessageModalProps {
  message: Message
  rooms: Room[]
  avatarVersions?: Record<string, string>
  currentUserId?: string
  onClose: () => void
  notify: (text: string) => void
}

export function ForwardMessageModal({
  message,
  rooms,
  avatarVersions,
  currentUserId,
  onClose,
  notify,
}: ForwardMessageModalProps) {
  useEscapeClose(onClose)
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<ForwardCandidate | null>(null)

  useEffect(() => {
    api.userDirectory().then(setUsers).catch(() => setUsers([]))
  }, [])

  const candidates = useMemo(() => {
    return getForwardCandidates({
      rooms,
      users,
      currentUserId,
      avatarVersions,
      query,
    })
  }, [rooms, users, currentUserId, avatarVersions, query])

  const forward = async (destination: ForwardCandidate) => {
    setBusy(true)
    try {
      const roomId = destination.targetRoomId ?? (await api.createDm(destination.targetUserId!)).id
      // O anexo é replicado pelo backend; o texto segue o original. A API exige
      // conteúdo não vazio, então usamos o nome do arquivo como fallback — o
      // serviço descarta a legenda redundante quando ela coincide com o anexo.
      const content = message.content || message.attachment?.originalName || 'Mensagem encaminhada'
      await api.sendMessage(roomId, content, undefined, message.id)
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
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <input
          autoComplete="off"
          className="input"
          placeholder="Pesquisar pessoa, grupo ou canal"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && selected && !busy) {
              event.preventDefault()
              void forward(selected)
            }
          }}
          autoFocus
        />
        <div className="forward-list">
          {candidates.length === 0 ? (
            <div className="forward-empty">Nenhum resultado encontrado</div>
          ) : (
            candidates.map((destination) => {
              const isSelected = selected?.key === destination.key
              return (
                <button
                  type="button"
                  className={`forward-user${isSelected ? ' selected' : ''}`}
                  disabled={busy}
                  key={destination.key}
                  onClick={() => setSelected(destination)}
                  onDoubleClick={() => void forward(destination)}
                >
                  <span className="forward-avatar-wrap">
                    <AvatarImage
                      path={destination.avatarPath}
                      className="forward-avatar-img"
                      fallback={
                        destination.iconType === 'user' ? (
                          <span className="forward-user-fallback" aria-hidden="true">
                            {destination.iconText}
                          </span>
                        ) : (
                          <span
                            className={`forward-room-fallback room-icon ${destination.iconType}`}
                            aria-hidden="true"
                          >
                            {destination.iconText}
                          </span>
                        )
                      }
                      alt={destination.name}
                    />
                  </span>
                  <div className="forward-user-info">
                    <strong>{destination.name}</strong>
                    <small>{destination.subtitle}</small>
                  </div>
                </button>
              )
            })
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={busy || !selected}
            onClick={() => selected && void forward(selected)}
          >
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}

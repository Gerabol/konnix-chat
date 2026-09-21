import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { AvatarImage, initials } from '../chat/AvatarImage'
import { api, userAvatarPath } from '../../api'
import type { DirectoryUser, User } from '../../api'

export function NewDmModal({
  me,
  onClose,
  onSelect,
}: {
  me: User
  onClose: () => void
  onSelect: (user: DirectoryUser) => void
}) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [selected, setSelected] = useState<DirectoryUser | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      setUsers(await api.userDirectory())
    } catch {
      setUsers([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(
      (u) =>
        u.id !== me.id &&
        u.accountStatus !== 'DISABLED' &&
        (!q || `${u.name} ${u.username}`.toLowerCase().includes(q)),
    )
  }, [users, search, me.id])

  const start = () => {
    if (!selected) return
    onSelect(selected)
  }

  return (
    <Modal title="Nova conversa" onClose={onClose}>
      <div className="modal-fields">
        <input
          className="input"
          placeholder="Buscar pessoa…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="picker-list">
          {filtered.length === 0 && <span className="nav-empty">Nenhuma pessoa encontrada</span>}
          {filtered.map((u) => (
            <button
              type="button"
              key={u.id}
              className={`picker-item ${selected?.id === u.id ? 'active' : ''}`}
              onClick={() => setSelected(u)}
            >
              <AvatarImage
                path={userAvatarPath(u.id)}
                className="mini-avatar"
                fallback={<span className="mini-avatar">{initials(u.name || u.username)}</span>}
                alt={u.name || u.username}
              />
              <span className="picker-item-text">
                <strong>{u.name || u.username}</strong>
                <small>@{u.username}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={start} disabled={!selected}>
          Iniciar conversa
        </button>
      </div>
    </Modal>
  )
}

export default NewDmModal

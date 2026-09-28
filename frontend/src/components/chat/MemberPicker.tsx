import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, userAvatarPath } from '../../api'
import type { DirectoryUser } from '../../api'
import { AvatarImage, initials } from './AvatarImage'

export function MemberPicker({
  selected,
  onChange,
  excludeId,
}: {
  selected: DirectoryUser[]
  onChange: (users: DirectoryUser[]) => void
  excludeId: string
}) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
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
        u.id !== excludeId &&
        u.accountStatus !== 'DISABLED' &&
        !selected.some((s) => s.id === u.id) &&
        (!q || `${u.name} ${u.username}`.toLowerCase().includes(q)),
    )
  }, [users, search, selected, excludeId])

  const toggle = (u: DirectoryUser) => {
    if (selected.some((s) => s.id === u.id)) {
      onChange(selected.filter((s) => s.id !== u.id))
    } else {
      onChange([...selected, u])
    }
  }

  return (
    <div className="member-picker">
      <input
        className="input"
        placeholder="Buscar pessoa…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {selected.length > 0 && (
        <div className="chips">
          {selected.map((u) => (
            <span key={u.id} className="chip-user">
              {u.name || u.username}
              <button onClick={() => toggle(u)} aria-label="Remover">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="picker-list small">
        {filtered.length === 0 && <span className="nav-empty">Nenhuma pessoa encontrada</span>}
        {filtered.map((u) => (
          <button key={u.id} className="picker-item" onClick={() => toggle(u)}>
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
  )
}

export default MemberPicker

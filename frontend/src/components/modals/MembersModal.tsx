import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, userAvatarPath } from '../../api'
import type { DirectoryUser, Room, RoomMember } from '../../api'
import { roomDisplayName } from '../../utils/room'
import { Modal } from './Modal'
import { AvatarImage, initials } from '../chat/AvatarImage'
import { IconTrash } from '../icons'

export function RoomPeopleSection({
  title,
  tone,
  members,
  onToggleOwner,
  busyId,
}: {
  title: string
  tone: 'owner' | 'member'
  members: RoomMember[]
  onToggleOwner?: (member: RoomMember) => void
  busyId?: string | null
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="room-people-section">
      <button
        type="button"
        className={`room-people-section-toggle ${tone === 'owner' ? 'owner-title' : 'member-title'}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`nav-chevron${open ? ' open' : ''}`}>›</span>
        <span>{title}</span>
      </button>
      {open && (
        <div className="picker-list small">
          {members.length === 0 && <span className="nav-empty">Nenhum usuário</span>}
          {members.map((member) => (
            <div className="picker-item picker-row" key={member.userId}>
              <AvatarImage
                path={userAvatarPath(member.userId)}
                className="mini-avatar"
                fallback={<span className="mini-avatar">{initials(member.name || member.username)}</span>}
                alt={member.name || member.username}
              />
              <span className="picker-item-text">
                <strong>{member.name || member.username}</strong>
                <small>@{member.username}</small>
              </span>
              <span className={`room-person-badge ${tone === 'owner' ? 'owner-badge' : 'member-badge'}`}>
                {tone === 'owner' ? 'Proprietário' : 'Membro'}
              </span>
              {onToggleOwner && (
                <button
                  type="button"
                  className={`owner-action ${member.role === 'OWNER' ? 'owner-action-remove' : 'owner-action-add'}`}
                  onClick={() => onToggleOwner(member)}
                  disabled={busyId !== null}
                  title={member.role === 'OWNER' ? `Remover ${member.name || member.username} de proprietário` : `Tornar ${member.name || member.username} proprietário`}
                >
                  {member.role === 'OWNER' ? 'Remover proprietário' : 'Tornar proprietário'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AddMembersModal({
  room,
  onClose,
  notify,
}: {
  room: Room
  onClose: () => void
  notify: (text: string) => void
}) {
  const [selected, setSelected] = useState<DirectoryUser[]>([])
  const [currentMembers, setCurrentMembers] = useState<RoomMember[]>([])
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyOwnerId, setBusyOwnerId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(true)

  useEffect(() => {
    Promise.all([api.members(room.id), api.userDirectory()]).then(([roomMembers, directory]) => {
      setCurrentMembers(roomMembers)
      setUsers(directory)
    }).catch(() => {
      setCurrentMembers([])
      setUsers([])
    })
  }, [room.id])

  const currentIds = new Set(currentMembers.map((member) => member.userId))
  const query = search.trim().toLowerCase()
  const available = users.filter((user) => user.accountStatus !== 'DISABLED' && !currentIds.has(user.id) && `${user.name} ${user.username}`.toLowerCase().includes(query))
  const owners = currentMembers.filter((member) => member.role === 'OWNER')
  const regularMembers = currentMembers.filter((member) => member.role !== 'OWNER')

  const add = async () => {
    if (selected.length === 0 || busy) return
    setBusy(true)
    let added = 0
    const failures: string[] = []
    for (const m of selected) {
      try {
        await api.addMember(room.id, m.id)
        added++
      } catch (error) {
        const reason = error instanceof ApiError ? error.message : 'Erro inesperado ao adicionar'
        failures.push(`${m.name || m.username}: ${reason}`)
      }
    }
    setBusy(false)
    if (added === 0) {
      notify(failures[0] || 'Nenhum membro foi adicionado. Verifique suas permissões.')
      return
    }
    if (failures.length > 0) {
      notify(`${added} membro(s) adicionado(s). Falhas: ${failures.join(' | ')}`)
    } else {
      notify(`${added} membro(s) adicionado(s)`)
    }
    onClose()
  }

  const toggleOwner = async (member: RoomMember) => {
    if (busyOwnerId) return
    setBusyOwnerId(member.userId)
    try {
      const role = member.role === 'OWNER' ? 'MEMBER' : 'OWNER'
      const updated = await api.updateMemberRole(room.id, member.userId, role)
      setCurrentMembers((prev) => prev.map((x) => (x.userId === updated.userId ? updated : x)))
      notify(role === 'OWNER' ? `${member.name || member.username} agora é proprietário` : `${member.name || member.username} deixou de ser proprietário`)
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Falha ao alterar proprietário')
    } finally {
      setBusyOwnerId(null)
    }
  }

  return (
    <Modal title={`Adicionar membros • ${roomDisplayName(room)}`} onClose={onClose} className="members-modal" overlayClassName="members-modal-overlay">
      <div className="members-modal-body">
      <div className="modal-fields">
        <input autoComplete="off" className="input" placeholder="Pesquisar usuário" value={search} onChange={(event) => setSearch(event.target.value)} />
        <RoomPeopleSection title="Proprietários" tone="owner" members={owners} onToggleOwner={toggleOwner} busyId={busyOwnerId} />
        <RoomPeopleSection title="Membros" tone="member" members={regularMembers} onToggleOwner={toggleOwner} busyId={busyOwnerId} />
        <div className="room-people-section">
          <button type="button" className="room-people-section-toggle invite-title" aria-expanded={inviteOpen} onClick={() => setInviteOpen((open) => !open)}>
            <span className={`nav-chevron${inviteOpen ? ' open' : ''}`}>›</span>
            <span>Pessoas para convidar</span>
          </button>
          {inviteOpen && (
            <div className="picker-list small">
              {available.length === 0 && <span className="nav-empty">Nenhuma pessoa encontrada</span>}
              {available.map((user) => (
                <button
                  key={user.id}
                  className={`picker-item ${selected.some((item) => item.id === user.id) ? 'active' : ''}`}
                  onClick={() => setSelected((prev) => prev.some((item) => item.id === user.id) ? prev.filter((item) => item.id !== user.id) : [...prev, user])}
                >
                  <AvatarImage
                    path={userAvatarPath(user.id)}
                    className="mini-avatar"
                    fallback={<span className="mini-avatar">{initials(user.name || user.username)}</span>}
                    alt={user.name || user.username}
                  />
                  <span className="picker-item-text">
                    <strong>{user.name || user.username}</strong>
                    <small>@{user.username}</small>
                  </span>
                  <span className="room-person-badge invite-badge">Convidar</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={add} disabled={busy || selected.length === 0}>
          {busy ? 'Adicionando…' : `Adicionar (${selected.length})`}
        </button>
      </div>
    </Modal>
  )
}

export function MembersModal({ room, onClose }: { room: Room; onClose: () => void }) {
  const [currentMembers, setCurrentMembers] = useState<RoomMember[]>([])

  useEffect(() => {
    api.members(room.id).then(setCurrentMembers).catch(() => setCurrentMembers([]))
  }, [room.id])

  const owners = currentMembers.filter((member) => member.role === 'OWNER')
  const regularMembers = currentMembers.filter((member) => member.role !== 'OWNER')

  return (
    <Modal title={`Membros • ${roomDisplayName(room)}`} onClose={onClose} className="members-modal" overlayClassName="members-modal-overlay">
      <div className="members-modal-body">
      <div className="modal-fields">
        <RoomPeopleSection title="Proprietários" tone="owner" members={owners} />
        <RoomPeopleSection title="Membros" tone="member" members={regularMembers} />
      </div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  )
}

export function RemoveMembersModal({
  room,
  onClose,
  notify,
}: {
  room: Room
  onClose: () => void
  notify: (text: string) => void
}) {
  const [members, setMembers] = useState<RoomMember[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setMembers(await api.members(room.id))
    } catch {
      setMembers([])
    }
  }, [room.id])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (m: RoomMember) => {
    if (busyId) return
    setBusyId(m.userId)
    try {
      await api.removeMember(room.id, m.userId)
      notify(`${m.name || m.username} foi removido(a) da sala`)
      setMembers((prev) => prev.filter((x) => x.userId !== m.userId))
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Falha ao remover membro')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal title={`Remover membros • ${roomDisplayName(room)}`} onClose={onClose} className="members-modal" overlayClassName="members-modal-overlay">
      <div className="members-modal-body">
      <div className="picker-list small">
        {members.length === 0 && <span className="nav-empty">Nenhum membro</span>}
        {members.map((m) => (
          <div key={m.userId} className="picker-item picker-row">
            <AvatarImage
              path={userAvatarPath(m.userId)}
              className="mini-avatar"
              fallback={<span className="mini-avatar">{initials(m.name || m.username)}</span>}
              alt={m.name || m.username}
            />
            <span className="picker-item-text">
              <strong>{m.name || m.username}</strong>
              <small>@{m.username}</small>
            </span>
            <button
              type="button"
              className="remove-member-btn"
              onClick={() => remove(m)}
              disabled={busyId !== null}
              title={`Remover ${m.name || m.username}`}
            >
              <IconTrash size={13} />
              <span>{busyId === m.userId ? 'Removendo…' : 'Remover'}</span>
            </button>
          </div>
        ))}
      </div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  )
}

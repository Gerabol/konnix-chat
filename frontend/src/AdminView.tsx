import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, formatBytes, userAvatarPath } from './api'
import type { AccountStatus, AppSettings, AuditEntry, AuditOptions, MonitoringMetrics, Room, RoomMember, User } from './api'
import { AvatarImage } from './App'
import ApiDocsPanel from './ApiDocsPanel'
import { validatePassword } from './passwordValidation'

type Tab = 'users' | 'rooms' | 'audit-actions' | 'monitoring' | 'api' | 'settings'
const ROLE_OPTIONS = ['ADMIN', 'USER', 'BOT']
const ACCOUNT_STATUS_OPTIONS: { value: AccountStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'READ_ONLY', label: 'Leitura' },
  { value: 'DISABLED', label: 'Desativado' },
]

function accountStatus(user: User): AccountStatus {
  if (user.roles.includes('ADMIN')) return 'ACTIVE'
  return user.accountStatus ?? (user.active ? 'ACTIVE' : 'DISABLED')
}

function accountStatusLabel(status: AccountStatus): string {
  return ACCOUNT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

function adminLogoPath(theme: User['theme']): string {
  const darkTheme = theme === 'DARK' || theme === 'BLACK_GRAY' || theme.endsWith('_BLACK') || theme.endsWith('_STRONG')
  const path = darkTheme ? '/icons/Konnix white.png' : '/icons/icon-192.png'
  return `${path}?theme=${theme}`
}

function adminThemeAttribute(theme: User['theme']): string {
  const normalized = theme.trim().replace(/-/g, '_').toUpperCase()
  return normalized === 'DEFAULT' ? '' : normalized.toLowerCase().replace('_', '-')
}

function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])
}

const ACCOUNT_STATUS_TONES: Record<AccountStatus, 'online' | 'away' | 'busy'> = {
  ACTIVE: 'online',
  READ_ONLY: 'away',
  DISABLED: 'busy',
}

function AccountStatusSelector({ status, onChange, disabled }: { status: AccountStatus; onChange: (status: AccountStatus) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const currentIndex = Math.max(0, ACCOUNT_STATUS_OPTIONS.findIndex((option) => option.value === status))
  const current = ACCOUNT_STATUS_OPTIONS[currentIndex]
  const tone = ACCOUNT_STATUS_TONES[current.value]

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = (next: AccountStatus) => {
    onChange(next)
    setOpen(false)
  }

  return <div className="presence-selector admin-account-status-selector" ref={menuRef}>
    <button
      type="button"
      className={`presence-pill presence-${tone}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label="Estado da conta"
      disabled={disabled}
      onClick={() => { setHighlightedIndex(currentIndex); setOpen((value) => !value) }}
      onKeyDown={(event) => {
        if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          setOpen(true)
        } else if (open && event.key === 'ArrowDown') {
          event.preventDefault()
          setHighlightedIndex((index) => (index + 1) % ACCOUNT_STATUS_OPTIONS.length)
        } else if (open && event.key === 'ArrowUp') {
          event.preventDefault()
          setHighlightedIndex((index) => (index - 1 + ACCOUNT_STATUS_OPTIONS.length) % ACCOUNT_STATUS_OPTIONS.length)
        } else if (open && event.key === 'Enter') {
          event.preventDefault()
          select(ACCOUNT_STATUS_OPTIONS[highlightedIndex].value)
        }
      }}
    >
      <span className="presence-dot" aria-hidden="true" />
      <span>{current.label}</span>
      <span className="presence-caret" aria-hidden="true">▾</span>
    </button>
    {open && <div className="presence-menu" role="menu">
      {ACCOUNT_STATUS_OPTIONS.map((option, index) => {
        const optionTone = ACCOUNT_STATUS_TONES[option.value]
        return <button
          type="button"
          role="menuitem"
          key={option.value}
          className={`presence-option presence-${optionTone} ${option.value === status ? 'selected' : ''} ${index === highlightedIndex ? 'highlighted' : ''}`}
          onMouseEnter={() => setHighlightedIndex(index)}
          onClick={() => select(option.value)}
        >
          <span className="presence-check">{option.value === status ? '✓' : ''}</span>
          <span className="presence-dot" aria-hidden="true" />
          <span>{option.label}</span>
        </button>
      })}
    </div>}
  </div>
}

export default function AdminView({ me, onBack }: { me: User; onBack: () => void }) {
  useEffect(() => {
    const attribute = adminThemeAttribute(me.theme)
    if (attribute) document.documentElement.dataset.theme = attribute
    else delete document.documentElement.dataset.theme
  }, [me.theme])

  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = sessionStorage.getItem('konnix-admin-tab') as Tab | null
      return saved && ['users', 'rooms', 'audit-actions', 'monitoring', 'api', 'settings'].includes(saved) ? saved : 'users'
    } catch { return 'users' }
  })
  const [toast, setToast] = useState<string | null>(null)
  const selectTab = (next: Tab) => {
    setTab(next)
    try { sessionStorage.setItem('konnix-admin-tab', next) } catch { /* preferência opcional */ }
  }
  const notify = useCallback((text: string) => {
    setToast(text)
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand">
           <img key={adminLogoPath(me.theme)} src={adminLogoPath(me.theme)} alt="Konnix" />
          <div><strong>Konnix</strong><span>Administração</span></div>
        </div>
        <div className="admin-header-actions">
          <span>{me.name}</span>
          <button className="btn-ghost" onClick={onBack}>Voltar ao chat</button>
        </div>
      </header>
      <div className="admin-body">
        <nav className="admin-tabs" aria-label="Administração">
           <button className={tab === 'users' ? 'active' : ''} onClick={() => selectTab('users')}>Users</button>
           <button className={tab === 'rooms' ? 'active' : ''} onClick={() => selectTab('rooms')}>Canais e grupos</button>
            <button className={tab === 'audit-actions' ? 'active' : ''} onClick={() => selectTab('audit-actions')}>Ações</button>
            <button className={tab === 'monitoring' ? 'active' : ''} onClick={() => selectTab('monitoring')}>Visão geral</button>
            <button className={tab === 'api' ? 'active' : ''} onClick={() => selectTab('api')}><span className="admin-tab-icon">&lt;/&gt;</span> API / Endpoints</button>
            <button className={tab === 'settings' ? 'active' : ''} onClick={() => selectTab('settings')}>Configurações</button>
        </nav>
        <main className="admin-content">
          {tab === 'users' && <UsersPanel notify={notify} />}
          {tab === 'rooms' && <RoomsPanel notify={notify} />}
           {tab === 'audit-actions' && <AuditPanel />}
            {tab === 'monitoring' && <MonitoringPanel />}
           {tab === 'api' && <ApiDocsPanel />}
          {tab === 'settings' && <SettingsPanel notify={notify} />}
        </main>
      </div>
      {toast && <button className="toast admin-toast" onClick={() => setToast(null)}>{toast}</button>}
    </div>
  )
}

function UsersPanel({ notify }: { notify: (text: string) => void }) {
  const [users, setUsers] = useState<User[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const requestId = useRef(0)
  const [busy, setBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [userPage, setUserPage] = useState(0)
  const [userPageSize, setUserPageSize] = useState(6)
  const [filters, setFilters] = useState({ active: true, readOnly: true, inactive: true, ADMIN: true, USER: true, BOT: true })

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current
    try {
      const result = await api.adminUsers(debouncedQuery, 0, 100)
      if (currentRequest === requestId.current) setUsers(result.items)
    } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao carregar usuários') }
  }, [notify, debouncedQuery])
  useEffect(() => { load() }, [load])

  const update = async (action: () => Promise<User>, success: string) => {
    if (busy) return
    setBusy(true)
    try { const updated = await action(); setUsers((old) => old.map((user) => user.id === updated.id ? updated : user)); notify(success) }
    catch (error) { notify(error instanceof ApiError ? error.message : 'Operação não realizada') }
    finally { setBusy(false) }
  }

  const toggleFilter = (filter: keyof typeof filters, group: ('active' | 'readOnly' | 'inactive')[] | ('ADMIN' | 'USER' | 'BOT')[], checked: boolean) => {
    if (!checked && group.every((item) => item === filter || !filters[item])) return
    setUserPage(0)
    setFilters((current) => ({ ...current, [filter]: checked }))
  }

  const filteredUsers = users.filter((user) => {
    const status = accountStatus(user)
    const statusVisible = status === 'ACTIVE' ? filters.active : status === 'READ_ONLY' ? filters.readOnly : filters.inactive
    return statusVisible && user.roles.some((role) => filters[role as 'ADMIN' | 'USER' | 'BOT'])
  })
  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize))
  const visibleUsers = filteredUsers.slice(userPage * userPageSize, userPage * userPageSize + userPageSize)
  const onlineCount = users.filter((user) => user.active && user.presenceStatus !== 'offline').length
  const offlineCount = users.length - onlineCount

  return (
    <section className="admin-panel">
       <div className="admin-panel-title"><div className="users-title-line"><h1>Users</h1><div className="user-metrics"><span>Total <strong>{users.length}</strong></span><span className="metric-online">● {onlineCount} online</span><span className="metric-offline">● {offlineCount} offline</span><span className="metric-active">● {users.filter((user) => accountStatus(user) === 'ACTIVE').length} ativos</span><span className="metric-read-only">● {users.filter((user) => accountStatus(user) === 'READ_ONLY').length} leitura</span><span className="metric-inactive">● {users.filter((user) => accountStatus(user) === 'DISABLED').length} desativados</span></div></div><button className="btn-primary" onClick={() => setCreateOpen(true)}>Novo usuário</button></div>
       <div className="admin-toolbar users-toolbar"><input className="input" value={query} placeholder="Pesquisar nome, username ou e-mail" onChange={(event) => { setUserPage(0); setQuery(event.target.value) }} /><div className="user-filter-groups"><div className="user-filter-group"><strong>Status</strong><div className="user-filter-list">{(['active', 'readOnly', 'inactive'] as const).map((filter) => <label key={filter}><input type="checkbox" checked={filters[filter]} onChange={(event) => toggleFilter(filter, ['active', 'readOnly', 'inactive'], event.target.checked)} />{filter === 'active' ? 'Ativos' : filter === 'readOnly' ? 'Leitura' : 'Desativados'}</label>)}</div></div><div className="user-filter-group"><strong>Roles</strong><div className="user-filter-list">{(['ADMIN', 'USER', 'BOT'] as const).map((filter) => <label key={filter}><input type="checkbox" checked={filters[filter]} onChange={(event) => toggleFilter(filter, ['ADMIN', 'USER', 'BOT'], event.target.checked)} />{filter}</label>)}</div></div></div></div>
       <Pager page={userPage} totalPages={userTotalPages} onPage={setUserPage} pageSize={userPageSize} onPageSize={(size) => { setUserPageSize(size); setUserPage(0) }} />
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Usuário</th><th>Username</th><th>Roles</th><th>Status</th><th>Ações</th></tr></thead><tbody>
         {visibleUsers.map((user) => <UserRow key={user.id} user={user} busy={busy} onEdit={() => setEditingUser(user)} onRoles={(roles) => update(() => api.adminUpdateRoles(user.id, roles), 'Roles atualizadas')} />)}
        {filteredUsers.length === 0 && <tr><td colSpan={5} className="admin-empty">Nenhum usuário encontrado.</td></tr>}
      </tbody></table></div>
      {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onUpdated={(updated) => setUsers((old) => old.map((item) => item.id === updated.id ? updated : item))} notify={notify} />}
      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={(user) => { setUsers((old) => [user, ...old]); setCreateOpen(false); notify('Usuário criado') }} notify={notify} />}
    </section>
  )
}

function UserRow({ user, busy, onEdit, onRoles }: { user: User; busy: boolean; onEdit: () => void; onRoles: (roles: string[]) => void }) {
  const [roles, setRoles] = useState(user.roles)
  const status = accountStatus(user)
  return <tr>
    <td><div className="admin-user-cell"><AvatarImage path={`${userAvatarPath(user.id)}?v=${encodeURIComponent(user.updatedAt)}`} className="admin-user-avatar" fallback={<span className="admin-user-avatar">{user.name.slice(0, 1).toUpperCase()}</span>} alt={user.name} /><span><strong>{user.name}</strong><small className="admin-subline">{user.email || 'sem e-mail'}</small>{user.passwordMigrationRequired && <span className="admin-warning">Senha pendente de migração</span>}</span></div></td>
    <td>@{user.username}</td>
    <td><div className="role-list">{ROLE_OPTIONS.map((role) => <label key={role}><input type="checkbox" checked={roles.includes(role)} disabled={busy} onChange={(event) => { const next = event.target.checked ? [...roles, role] : roles.filter((item) => item !== role); setRoles(next); onRoles(next) }} />{role}</label>)}</div></td>
    <td><span className={`admin-status ${status === 'ACTIVE' ? 'active' : status === 'READ_ONLY' ? 'read-only' : 'inactive'}`}>{accountStatusLabel(status)}</span></td>
    <td><div className="admin-row-actions"><button className="icon-action" title="Editar usuário" aria-label="Editar usuário" onClick={onEdit}>✎</button></div></td>
  </tr>
}

function EditUserModal({ user, onClose, onUpdated, notify }: { user: User; onClose: () => void; onUpdated: (user: User) => void; notify: (text: string) => void }) {
  useEscapeClose(onClose)
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [roles, setRoles] = useState(user.roles)
  const [avatar, setAvatar] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<AccountStatus>(accountStatus(user))
  const save = async () => {
    const passwordError = validatePassword(password)
    if (password && passwordError) { notify(passwordError); return }
    setBusy(true)
    try {
      let updated = await api.requestAdminProfile(user.id, name, email, password || undefined)
      if (JSON.stringify([...roles].sort()) !== JSON.stringify([...user.roles].sort())) updated = await api.adminUpdateRoles(user.id, roles)
      if (avatar) updated = await api.uploadUserAvatar(user.id, avatar)
      if (selectedStatus !== accountStatus(user)) updated = await api.adminUpdateAccountStatus(user.id, selectedStatus)
      onUpdated(updated)
      notify('Usuário atualizado')
      onClose()
    } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao atualizar usuário') }
    finally { setBusy(false) }
  }
  return <div className="admin-modal-overlay"><div className="admin-modal"><div className="modal-head"><h3>Editar usuário</h3><button className="modal-close" onClick={onClose}>×</button></div><div className="edit-user-heading"><AvatarImage path={`${userAvatarPath(user.id)}?v=${encodeURIComponent(user.updatedAt)}`} className="edit-user-avatar" fallback={<span className="edit-user-avatar">{user.name.slice(0, 1).toUpperCase()}</span>} alt={user.name} /><div className="edit-user-title"><strong>{user.name}</strong><small>@{user.username}</small></div><AccountStatusSelector status={selectedStatus} onChange={setSelectedStatus} disabled={busy || user.roles.includes('ADMIN')} /></div><div className="modal-fields"><label className="admin-label">Nome<input autoComplete="off" className="input" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="admin-label">E-mail<input autoComplete="off" className="input" value={email} onChange={(event) => setEmail(event.target.value)} /></label><div className="password-roles-row"><label className="admin-label">Nova senha (opcional)<span className="password-input-wrap"><input autoComplete="new-password" className="input" type={showPassword ? 'text' : 'password'} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" /><button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}>{showPassword ? 'Ocultar' : 'Exibir'}</button></span></label><div className="edit-role-grid"><strong>Roles</strong>{ROLE_OPTIONS.map((role) => <label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={(event) => setRoles(event.target.checked ? [...roles, role] : roles.filter((item) => item !== role))} />{role}</label>)}</div></div><label className="admin-label">Imagem de perfil<input autoComplete="off" className="input" type="file" accept="image/*" onChange={(event) => setAvatar(event.target.files?.[0] || null)} /></label></div><div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !name.trim() || (password.length > 0 && password.length < 8)} onClick={save}>{busy ? 'Salvando...' : 'Salvar alterações'}</button></div></div></div>
}

function CreateUserModal({ onClose, onCreated, notify }: { onClose: () => void; onCreated: (user: User) => void; notify: (text: string) => void }) {
  useEscapeClose(onClose)
  const [form, setForm] = useState({ username: '', name: '', email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [avatar, setAvatar] = useState<File | null>(null)
  const [roles, setRoles] = useState(['USER'])
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!form.name.trim() || !form.username.trim()) { notify('Preencha nome e username'); return }
    const passwordError = validatePassword(form.password)
    if (passwordError) { notify(passwordError); return }
    if (roles.length === 0) { notify('Selecione pelo menos uma role'); return }
    setBusy(true)
    try { let user = await api.createUser(form); if (JSON.stringify(roles) !== JSON.stringify(['USER'])) user = await api.adminUpdateRoles(user.id, roles); if (avatar) user = await api.uploadUserAvatar(user.id, avatar); onCreated(user) } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao criar usuário') } finally { setBusy(false) }
  }
  return <div className="admin-modal-overlay"><div className="admin-modal"><div className="modal-head"><h3>Novo usuário</h3><button className="modal-close" onClick={onClose}>×</button></div><div className="edit-user-heading"><span className="admin-user-avatar admin-generic-avatar">👤</span><div className="edit-user-title"><strong>Novo usuário</strong><small>Configure os dados da conta</small></div><span className="admin-status active">Ativo</span></div><div className="modal-fields"><label className="admin-label">Nome<input autoComplete="off" className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="admin-label">Username<input autoComplete="off" className="input" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label><label className="admin-label">E-mail<input autoComplete="off" className="input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><div className="password-roles-row"><label className="admin-label">Senha<span className="password-input-wrap"><input autoComplete="new-password" className="input" type={showPassword ? 'text' : 'password'} minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}>{showPassword ? 'Ocultar' : 'Exibir'}</button></span></label><div className="edit-role-grid"><strong>Roles</strong>{ROLE_OPTIONS.map((role) => <label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={(event) => setRoles(event.target.checked ? [...roles, role] : roles.filter((item) => item !== role))} />{role}</label>)}</div></div><label className="admin-label">Imagem de perfil<input autoComplete="off" className="input" type="file" accept="image/*" onChange={(event) => setAvatar(event.target.files?.[0] || null)} /></label></div><div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Criando...' : 'Criar usuário'}</button></div></div></div>
}

function RoomsPanel({ notify }: { notify: (text: string) => void }) {
  const [roomRows, setRoomRows] = useState<{ room: Room; members: RoomMember[] }[]>([])
  const [selected, setSelected] = useState<Room | null>(null)
  const [ownersRoom, setOwnersRoom] = useState<{ room: Room; members: RoomMember[] } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [roomPage, setRoomPage] = useState(0)
  const [roomPageSize, setRoomPageSize] = useState(6)
  const [roomQuery, setRoomQuery] = useState('')
  const load = useCallback(async () => { try { const rooms = await api.adminRooms(); const rows = await Promise.all(rooms.map(async (room) => ({ room, members: await api.adminMembers(room.id).catch(() => []) }))); setRoomRows(rows) } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao carregar salas') } }, [notify])
  useEffect(() => { load() }, [load])
  const filteredRows = roomRows.filter(({ room }) => `${room.name} ${room.displayName}`.toLowerCase().includes(roomQuery.toLowerCase()))
  const roomTotalPages = Math.max(1, Math.ceil(filteredRows.length / roomPageSize))
  const visibleRooms = filteredRows.slice(roomPage * roomPageSize, roomPage * roomPageSize + roomPageSize)
  const readOnlyCount = roomRows.filter(({ room }) => room.readOnly).length
  return <section className="admin-panel"><div className="admin-panel-title"><div className="users-title-line"><h1>Canais e grupos</h1><div className="user-metrics"><span>Total de grupos <strong>{roomRows.length}</strong></span><span className="metric-online">● {roomRows.length - readOnlyCount} normais</span><span className="metric-inactive">● {readOnlyCount} só leitura</span></div></div><button className="btn-primary" onClick={() => setCreateOpen(true)}>Novo canal</button></div><div className="admin-toolbar"><input autoComplete="off" className="input" value={roomQuery} placeholder="Pesquisar canal ou grupo" onChange={(event) => { setRoomPage(0); setRoomQuery(event.target.value) }} /></div><Pager page={roomPage} totalPages={roomTotalPages} onPage={setRoomPage} pageSize={roomPageSize} onPageSize={(size) => { setRoomPageSize(size); setRoomPage(0) }} /><div className="admin-table-wrap"><table className="admin-table admin-rooms-table"><thead><tr><th>Sala</th><th>Usuários</th><th>Status</th><th>Criação</th><th>Ações</th></tr></thead><tbody>{visibleRooms.map(({ room, members }) => <tr key={room.id}><td><div className="admin-user-cell"><AvatarImage path={`${apiRoomAvatar(room.id)}?v=${encodeURIComponent(room.updatedAt)}`} className="admin-room-avatar" fallback={<span className="admin-room-avatar">{room.type === 'CHANNEL' ? '#' : '🔒'}</span>} alt={room.displayName || room.name} /><span><strong>{room.displayName || room.name}</strong><small className="admin-subline">{room.type === 'CHANNEL' ? 'Canal' : 'Grupo privado'} · {room.name}</small></span></div></td><td>{members.length}</td><td><span className={`admin-status ${room.readOnly ? 'inactive' : 'active'}`}>{room.readOnly ? 'Só leitura' : 'Normal'}</span></td><td>{new Date(room.createdAt).toLocaleDateString('pt-BR')}</td><td><div className="admin-row-actions"><button className="icon-action" title="Editar sala" aria-label="Editar sala" onClick={() => setSelected(room)}>✎</button><button className="owner-action" onClick={() => setOwnersRoom({ room, members })}>Proprietários</button></div></td></tr>)}{visibleRooms.length === 0 && <tr><td colSpan={5} className="admin-empty">Nenhuma sala encontrada.</td></tr>}</tbody></table></div>{selected && <RoomEditor room={selected} onClose={() => setSelected(null)} onSaved={(room) => { setRoomRows((old) => old.map((row) => row.room.id === room.id ? { ...row, room } : row)); setSelected(null); notify('Sala atualizada') }} notify={notify} />}{ownersRoom && <OwnersModal room={ownersRoom.room} members={ownersRoom.members} onClose={() => setOwnersRoom(null)} onChanged={(members) => { setRoomRows((old) => old.map((row) => row.room.id === ownersRoom.room.id ? { ...row, members } : row)); setOwnersRoom({ ...ownersRoom, members }) }} notify={notify} />}{createOpen && <CreateChannelModal onClose={() => setCreateOpen(false)} onCreated={(room) => { setRoomRows((old) => [{ room, members: [] }, ...old]); setRoomPage(0); setCreateOpen(false); notify('Canal criado') }} notify={notify} />}</section>
}

function apiRoomAvatar(roomId: string) { return `/api/v1/rooms/${roomId}/avatar` }

function OwnersModal({ room, members, onClose, onChanged, notify }: { room: Room; members: RoomMember[]; onClose: () => void; onChanged: (members: RoomMember[]) => void; notify: (text: string) => void }) {
  useEscapeClose(onClose)
  const owners = members.filter((member) => member.role === 'OWNER')
  const promote = async (member: RoomMember, role: 'OWNER' | 'MEMBER') => { try { const updated = await api.adminUpdateMemberRole(room.id, member.userId, role); onChanged(members.map((item) => item.userId === updated.userId ? updated : item)); notify(role === 'OWNER' ? 'Proprietário adicionado' : 'Proprietário removido') } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao alterar proprietário') } }
  return <div className="admin-modal-overlay"><div className="admin-modal"><div className="modal-head"><h3>Proprietários · {room.displayName || room.name}</h3><button className="modal-close" onClick={onClose}>×</button></div><div className="modal-fields"><p className="admin-modal-hint">Escolha quais membros podem administrar esta sala.</p>{members.map((member) => <div className="admin-member" key={member.userId}><div className="admin-member-person"><AvatarImage path={`${userAvatarPath(member.userId)}?v=${encodeURIComponent(member.joinedAt)}`} className="admin-member-avatar" fallback={<span className="admin-member-avatar">{(member.name || member.username).slice(0, 1).toUpperCase()}</span>} alt={member.name || member.username} /><span>{member.name || member.username}<small className="admin-subline">@{member.username}</small></span></div><button className={member.role === 'OWNER' ? 'danger-action' : 'btn-ghost'} onClick={() => void promote(member, member.role === 'OWNER' ? 'MEMBER' : 'OWNER')}>{member.role === 'OWNER' ? 'Remover proprietário' : 'Tornar proprietário'}</button></div>)}{owners.length === 0 && <div className="admin-empty">Nenhum proprietário definido.</div>}</div><div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Fechar</button></div></div></div>
}

function CreateChannelModal({ onClose, onCreated, notify }: { onClose: () => void; onCreated: (room: Room) => void; notify: (text: string) => void }) {
  useEscapeClose(onClose)
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => { setBusy(true); try { let room = await api.createRoom(name, displayName, 'CHANNEL'); if (avatar) room = await api.uploadRoomAvatar(room.id, avatar); onCreated(room) } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao criar canal') } finally { setBusy(false) } }
  return <div className="admin-modal-overlay"><div className="admin-modal"><div className="modal-head"><h3>Novo canal</h3><button className="modal-close" onClick={onClose}>×</button></div><div className="new-user-avatar"><span className="admin-room-avatar admin-generic-avatar">#</span><span>Imagem opcional do canal</span></div><div className="modal-fields"><input autoComplete="off" className="input" placeholder="Nome técnico" value={name} onChange={(event) => setName(event.target.value)} /><input autoComplete="off" className="input" placeholder="Nome de exibição" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><label className="admin-label">Imagem do canal<input autoComplete="off" className="input" type="file" accept="image/*" onChange={(event) => setAvatar(event.target.files?.[0] || null)} /></label></div><div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !name.trim()} onClick={submit}>{busy ? 'Criando...' : 'Criar canal'}</button></div></div></div>
}

function RoomEditor({ room, onClose, onSaved, notify }: { room: Room; onClose: () => void; onSaved: (room: Room) => void; notify: (text: string) => void }) {
  useEscapeClose(onClose)
  const [name, setName] = useState(room.name || '')
  const [displayName, setDisplayName] = useState(room.displayName || '')
  const [readOnly, setReadOnly] = useState(room.readOnly)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [newMember, setNewMember] = useState('')
  const save = async () => { try { onSaved(await api.adminUpdateRoom(room.id, { name, displayName, readOnly })) } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao atualizar sala') } }
  useEffect(() => { api.adminMembers(room.id).then(setMembers).catch(() => setMembers([])) }, [room.id])
  useEffect(() => { api.adminUsers('', 0, 100).then((result) => setUsers(result.items)).catch(() => setUsers([])) }, [])
  return <div className="admin-modal-overlay"><div className="admin-modal admin-room-modal"><div className="modal-head"><h3>Editar sala</h3><button className="modal-close" onClick={onClose}>×</button></div><div className="modal-fields"><label className="admin-label">Nome técnico<input className="input" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="admin-label">Nome de exibição<input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label className="admin-check"><input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} /> Somente leitura</label><h4>Membros ({members.length})</h4><div className="admin-member-add"><select className="input" value={newMember} onChange={(event) => setNewMember(event.target.value)}><option value="">Adicionar membro...</option>{users.filter((user) => !members.some((member) => member.userId === user.id)).map((user) => <option key={user.id} value={user.id}>{user.name} (@{user.username})</option>)}</select><button className="btn-ghost" disabled={!newMember} onClick={async () => { try { const member = await api.adminAddMember(room.id, newMember); setMembers((old) => [...old, member]); setNewMember('') } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao adicionar membro') } }}>Adicionar</button></div>{members.map((member) => <div className="admin-member" key={member.userId}><div className="admin-member-person"><AvatarImage path={`${userAvatarPath(member.userId)}?v=${encodeURIComponent(member.joinedAt)}`} className="admin-member-avatar" fallback={<span className="admin-member-avatar">{(member.name || member.username).slice(0, 1).toUpperCase()}</span>} alt={member.name || member.username} /><span>{member.name || member.username}<small className="admin-subline">@{member.username}</small></span></div><button className="btn-ghost" onClick={async () => { try { await api.adminRemoveMember(room.id, member.userId); setMembers((old) => old.filter((item) => item.userId !== member.userId)) } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao remover membro') } }}>Remover</button></div>)}</div><div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Fechar</button><button className="btn-primary" onClick={save}>Salvar</button></div></div></div>
}

function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [options, setOptions] = useState<AuditOptions>({ users: [], actions: [], resources: [] })
  const [filters, setFilters] = useState({ user: '', action: '', resource: '', from: '', to: '' })
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const from = filters.from ? new Date(filters.from).toISOString() : ''
      const to = filters.to ? new Date(new Date(filters.to).getTime() + 60_000).toISOString() : ''
      const result = await api.adminAudit({ ...filters, from, to }, page)
      setEntries(result.items)
      setTotalPages(result.totalPages)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Não foi possível carregar a auditoria')
      setEntries([])
    } finally { setLoading(false) }
  }, [filters, page])
  useEffect(() => {
    api.adminAuditOptions().then(setOptions).catch(() => undefined)
  }, [])
  useEffect(() => { load() }, [load])
  const clear = () => { setFilters({ user: '', action: '', resource: '', from: '', to: '' }); setPage(0) }
  return <section className="admin-panel">
    <div className="admin-panel-title"><div><h1>Ações</h1><p>Registro seguro das ações administrativas.</p></div></div>
    <div className="admin-filter-grid">
      <label className="admin-label">Usuário<select className="input" value={filters.user} onChange={(event) => { setPage(0); setFilters({ ...filters, user: event.target.value }) }}><option value="">Todos os usuários</option>{options.users.map((user) => <option key={user.id} value={user.id}>{user.name || user.username} (@{user.username})</option>)}</select></label>
      <label className="admin-label">Ação<select className="input" value={filters.action} onChange={(event) => { setPage(0); setFilters({ ...filters, action: event.target.value }) }}><option value="">Todas as ações</option>{options.actions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
      <label className="admin-label">Recurso<select className="input" value={filters.resource} onChange={(event) => { setPage(0); setFilters({ ...filters, resource: event.target.value }) }}><option value="">Todos os recursos</option>{options.resources.map((resource) => <option key={resource} value={resource}>{resource}</option>)}</select></label>
      <label className="admin-label">De<input className="input" type="datetime-local" value={filters.from} onChange={(event) => { setPage(0); setFilters({ ...filters, from: event.target.value }) }} /></label>
      <label className="admin-label">Até<input className="input" type="datetime-local" value={filters.to} onChange={(event) => { setPage(0); setFilters({ ...filters, to: event.target.value }) }} /></label>
    </div>
    <div className="admin-filter-actions"><button className="btn-primary" onClick={() => { setPage(0); load() }}>Aplicar filtros</button><button className="btn-ghost" onClick={clear}>Limpar filtros</button></div>
    {loading && <div className="admin-loading">Carregando auditoria...</div>}
    {error && <div className="admin-error">{error}</div>}
    {!loading && !error && entries.length === 0 && <div className="admin-empty">Nenhum registro encontrado.</div>}
    {!loading && !error && entries.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Recurso</th><th>Identificador</th><th>IP</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleString('pt-BR')}</td><td>{entry.name || entry.username || 'Sistema'}{entry.username && <small className="admin-subline">@{entry.username}</small>}</td><td><code>{entry.action}</code></td><td>{entry.resource || '—'}</td><td className="admin-id">{entry.resourceId || '—'}</td><td>{entry.ipAddress || '—'}</td></tr>)}</tbody></table></div>}
    {!loading && !error && <Pager page={page} totalPages={totalPages} onPage={setPage} />}
  </section>
}

function MonitoringPanel() {
  const [metrics, setMetrics] = useState<MonitoringMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.adminMonitoringMetrics().then(setMetrics).catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Não foi possível carregar as métricas'))
  }, [])
  const megabytes = metrics ? (metrics.databaseSizeBytes / (1024 * 1024)).toFixed(1) : '0.0'
  const fileGigabytes = metrics ? (metrics.totalFileBytes / (1024 * 1024 * 1024)).toFixed(2) : '0.00'
  return <section className="admin-panel">
    <div className="admin-panel-title"><div><h1>Visão geral</h1><p>Indicadores operacionais do Konnix Chat.</p></div></div>
    {error && <div className="admin-error">{error}</div>}
    {!error && !metrics && <div className="admin-loading">Carregando métricas...</div>}
    {metrics && <>
      <ActivityChart activity={metrics.activity} />
      <div className="monitoring-grid">
      <MetricCard label="Arquivos" value={metrics.totalFiles.toLocaleString('pt-BR')} detail={`${fileGigabytes} GB em anexos`} />
      <MetricCard label="Banco de dados" value={`${megabytes} MB`} detail="Tamanho atual no PostgreSQL" />
      <MetricCard label="Mensagens" value={metrics.totalMessages.toLocaleString('pt-BR')} detail="Mensagens registradas" />
      <MetricCard label="Usuários" value={metrics.totalUsers.toLocaleString('pt-BR')} detail={`${metrics.activeUsers} ativos · ${metrics.readOnlyUsers} leitura · ${metrics.disabledUsers} desativados`} />
      <MetricCard label="Grupos" value={metrics.totalGroups.toLocaleString('pt-BR')} detail={`${metrics.totalChannels} canais`} />
      <MetricCard label="Logins hoje" value={metrics.dailyLogins.toLocaleString('pt-BR')} detail="Entradas bem-sucedidas desde meia-noite" />
      <MetricCard label="Sessões ativas" value={metrics.activeSessions.toLocaleString('pt-BR')} detail="Sessões válidas no momento" />
      <MetricCard label="Eventos auditados" value={metrics.totalAuditEvents.toLocaleString('pt-BR')} detail="Registros de auditoria" />
      </div>
    </>}
  </section>
}

function ActivityChart({ activity }: { activity: MonitoringMetrics['activity'] }) {
  const maximum = Math.max(1, ...activity.map((point) => point.messages))
  return <article className="activity-card">
    <div className="activity-card-head"><div><h2>Atividade</h2><p>Mensagens nos últimos sete dias.</p></div><span className="activity-period">7 dias ▾</span></div>
    <div className="activity-chart" aria-label="Mensagens e usuários ativos nos últimos sete dias">
      {activity.map((point) => <div className="activity-column" key={point.day} title={`${point.messages} mensagens, ${point.activeUsers} usuários ativos`}><div className="activity-bars"><i style={{ height: `${Math.max(point.messages ? 8 : 2, point.messages / maximum * 100)}%` }} /><i className="activity-users-bar" style={{ height: `${Math.max(point.activeUsers ? 8 : 2, point.activeUsers / Math.max(1, ...activity.map((item) => item.activeUsers)) * 100)}%` }} /></div><small>{new Date(`${point.day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small></div>)}
    </div>
    <div className="activity-legend"><span><i />Mensagens</span><span><i className="activity-users-dot" />Usuários ativos</span></div>
  </article>
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="monitoring-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function SettingsPanel({ notify }: { notify: (text: string) => void }) {
  const [settings, setSettings] = useState<AppSettings>({ name: '', maxUploadBytes: 62914560 })
  const [readEnabled, setReadEnabled] = useState(true)
  useEffect(() => { api.adminSettings().then(setSettings).catch(() => undefined) }, [])
  useEffect(() => { api.readReceiptSetting().then((setting) => setReadEnabled(setting.enabled)).catch(() => undefined) }, [])
  const saveApp = async (input: AppSettings) => { try { setSettings(await api.adminUpdateSettings(input)); notify('Configuração salva') } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao salvar configuração') } }
  const toggleRead = async () => { try { const result = await api.setReadReceiptSetting(!readEnabled); setReadEnabled(result.enabled); notify('Confirmação de leitura atualizada') } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao alterar confirmação de leitura') } }
  return <section className="admin-panel"><div className="admin-panel-title"><div><h1>Configurações</h1><p>Cada configuração pode ser alterada de forma independente.</p></div></div><div className="settings-table-wrap"><table className="admin-table settings-table"><thead><tr><th>Configuração</th><th>Valor</th><th>Status</th><th>Ação</th></tr></thead><tbody><tr><td><strong>Nome da aplicação</strong><small className="admin-subline">Nome exibido no sistema</small></td><td><input className="input settings-value" value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} /></td><td><span className="admin-status active">Ativa</span></td><td><button className="btn-primary" onClick={() => saveApp(settings)}>Salvar</button></td></tr><tr><td><strong>Limite máximo de upload</strong><small className="admin-subline">Tamanho permitido para arquivos</small></td><td><div className="settings-upload-value"><input className="input settings-value" type="number" min={1} value={settings.maxUploadBytes} onChange={(event) => setSettings({ ...settings, maxUploadBytes: Number(event.target.value) })} /><small>{formatBytes(settings.maxUploadBytes)}</small></div></td><td><span className="admin-status active">Ativa</span></td><td><button className="btn-primary" onClick={() => saveApp(settings)}>Salvar</button></td></tr><tr><td><strong>Confirmação de leitura</strong><small className="admin-subline">Permite registrar e consultar quem leu mensagens</small></td><td><span className={`admin-status ${readEnabled ? 'active' : 'inactive'}`}>{readEnabled ? 'Ativa' : 'Desativada'}</span></td><td><span className={`admin-status ${readEnabled ? 'active' : 'inactive'}`}>{readEnabled ? 'Ativa' : 'Desativada'}</span></td><td><button className={`settings-toggle ${readEnabled ? 'on' : 'off'}`} onClick={toggleRead}>{readEnabled ? 'Desativar' : 'Ativar'}</button></td></tr></tbody></table></div></section>
}

function Pager({ page, totalPages, onPage, pageSize, onPageSize }: { page: number; totalPages: number; onPage: (page: number) => void; pageSize?: number; onPageSize?: (size: number) => void }) {
  if (totalPages <= 0) return null
  return <div className="admin-pager">{pageSize && onPageSize && <label className="admin-page-size">Registros <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}><option value={6}>6</option><option value={15}>15</option><option value={30}>30</option><option value={50}>50</option></select></label>}<button className="btn-ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>Anterior</button><span>{page + 1} / {totalPages}</span><button className="btn-ghost" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)}>Próxima</button></div>
}

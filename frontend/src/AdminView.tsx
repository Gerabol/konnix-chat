import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, formatBytes, userAvatarPath } from './api'
import type { AccountStatus, AppSettings, AuditEntry, AuditOptions, MessageTimeSeriesPeriod, MessageTimeSeriesResponse, MonitoringMetrics, Room, RoomMember, User } from './api'
import { AvatarImage, cacheTheme, PaletteIcon, ThemeModal, applyTheme } from './App'
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
  return `/icons/Konnix white.png?theme=${theme}`
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
  const [currentTheme, setCurrentTheme] = useState<User['theme']>(() => me.theme)
  const [showThemeModal, setShowThemeModal] = useState(false)

  useEffect(() => {
    const attribute = adminThemeAttribute(currentTheme)
    if (attribute) document.documentElement.dataset.theme = attribute
    else delete document.documentElement.dataset.theme
  }, [currentTheme])

  // Keep theme in sync when changed from the chat side (and vice-versa)
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<string>).detail as User['theme']
      setCurrentTheme(next)
      applyTheme(next)
    }
    window.addEventListener('konnix:theme-changed', handler)
    return () => window.removeEventListener('konnix:theme-changed', handler)
  }, [])

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
           <img key={adminLogoPath(currentTheme)} src={adminLogoPath(currentTheme)} alt="Konnix" />
          <div><strong>Konnix</strong><span>Administração</span></div>
        </div>
        <div className="admin-header-actions">
          <span className="admin-user-name" title={me.name}>{me.name}</span>
          <button
            type="button"
            className="btn-ghost admin-theme-btn"
            aria-label="Selecionar tema"
            title="Selecionar tema"
            onClick={() => setShowThemeModal(true)}
          >
            <PaletteIcon />
          </button>
          <button className="btn-ghost admin-back-btn" onClick={onBack}>Voltar ao chat</button>
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
      {showThemeModal && (
        <ThemeModal
          theme={currentTheme as any}
          onClose={() => setShowThemeModal(false)}
          onPreview={(t) => { setCurrentTheme(t as any); applyTheme(t) }}
          onSaved={(user) => {
            setCurrentTheme(user.theme)
            cacheTheme(user.theme)
            setShowThemeModal(false)
          }}
          notify={notify}
        />
      )}
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
  return <section className="admin-panel"><div className="admin-panel-title"><div className="users-title-line"><h1>Canais e grupos</h1><div className="user-metrics"><span>Total de salas <strong>{roomRows.length}</strong></span><span className="metric-online">● {roomRows.length - readOnlyCount} normais</span><span className="metric-inactive">● {readOnlyCount} só leitura</span></div></div><button className="btn-primary" onClick={() => setCreateOpen(true)}>Nova sala</button></div><div className="admin-toolbar"><input autoComplete="off" className="input" value={roomQuery} placeholder="Pesquisar canal ou grupo" onChange={(event) => { setRoomPage(0); setRoomQuery(event.target.value) }} /></div><Pager page={roomPage} totalPages={roomTotalPages} onPage={setRoomPage} pageSize={roomPageSize} onPageSize={(size) => { setRoomPageSize(size); setRoomPage(0) }} /><div className="admin-table-wrap"><table className="admin-table admin-rooms-table"><thead><tr><th>Sala</th><th>Usuários</th><th>Status</th><th>Criação</th><th>Ações</th></tr></thead><tbody>{visibleRooms.map(({ room, members }) => <tr key={room.id}><td><div className="admin-user-cell"><AvatarImage path={`${apiRoomAvatar(room.id)}?v=${encodeURIComponent(room.updatedAt)}`} className="admin-room-avatar" fallback={<span className="admin-room-avatar">{room.type === 'CHANNEL' ? '#' : '🔒'}</span>} alt={room.displayName || room.name} /><span><strong>{room.displayName || room.name}</strong><small className="admin-subline">{room.type === 'CHANNEL' ? 'Canal (#)' : 'Grupo (🔒)'} · {room.name}</small></span></div></td><td>{members.length}</td><td><span className={`admin-status ${room.readOnly ? 'inactive' : 'active'}`}>{room.readOnly ? 'Só leitura' : 'Normal'}</span></td><td>{new Date(room.createdAt).toLocaleDateString('pt-BR')}</td><td><div className="admin-row-actions"><button className="icon-action" title="Editar sala" aria-label="Editar sala" onClick={() => setSelected(room)}>✎</button><button className="owner-action" onClick={() => setOwnersRoom({ room, members })}>Proprietários</button></div></td></tr>)}{visibleRooms.length === 0 && <tr><td colSpan={5} className="admin-empty">Nenhuma sala encontrada.</td></tr>}</tbody></table></div>{selected && <RoomEditor room={selected} onClose={() => setSelected(null)} onSaved={(room) => { setRoomRows((old) => old.map((row) => row.room.id === room.id ? { ...row, room } : row)); setSelected(null); notify('Sala atualizada') }} notify={notify} />}{ownersRoom && <OwnersModal room={ownersRoom.room} members={ownersRoom.members} onClose={() => setOwnersRoom(null)} onChanged={(members) => { setRoomRows((old) => old.map((row) => row.room.id === ownersRoom.room.id ? { ...row, members } : row)); setOwnersRoom({ ...ownersRoom, members }) }} notify={notify} />}{createOpen && <CreateChannelModal onClose={() => setCreateOpen(false)} onCreated={(room) => { setRoomRows((old) => [{ room, members: [] }, ...old]); setRoomPage(0); setCreateOpen(false); notify('Sala criada') }} notify={notify} />}</section>
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
  const [type, setType] = useState<'CHANNEL' | 'PRIVATE_GROUP'>('CHANNEL')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => { setBusy(true); try { let room = await api.createRoom(name, displayName, type); if (avatar) room = await api.uploadRoomAvatar(room.id, avatar); onCreated(room) } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao criar sala') } finally { setBusy(false) } }
  return <div className="admin-modal-overlay"><div className="admin-modal"><div className="modal-head"><h3>Nova sala / canal</h3><button className="modal-close" onClick={onClose}>×</button></div><div className="new-user-avatar"><span className="admin-room-avatar admin-generic-avatar">{type === 'CHANNEL' ? '#' : '🔒'}</span><span>Imagem opcional da sala</span></div><div className="modal-fields"><label className="admin-label">Tipo de sala<select className="input" value={type} onChange={(e) => setType(e.target.value as 'CHANNEL' | 'PRIVATE_GROUP')}><option value="CHANNEL"># Canal</option><option value="PRIVATE_GROUP">🔒 Grupo</option></select></label><input autoComplete="off" className="input" placeholder="Nome técnico (ex: financeiro)" value={name} onChange={(event) => setName(event.target.value)} /><input autoComplete="off" className="input" placeholder="Nome de exibição (ex: Financeiro)" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><label className="admin-label">Imagem da sala<input autoComplete="off" className="input" type="file" accept="image/*" onChange={(event) => setAvatar(event.target.files?.[0] || null)} /></label></div><div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !name.trim()} onClick={submit}>{busy ? 'Criando...' : 'Criar sala'}</button></div></div></div>
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

const DAILY_ACTIVE_DAYS_OPTIONS = [
  { value: 7, label: '7 dias' },
  { value: 15, label: '15 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
]

const MESSAGE_TIME_SERIES_OPTIONS: { value: MessageTimeSeriesPeriod; label: string }[] = [
  { value: 'DAYS_7', label: '7 dias' },
  { value: 'DAYS_30', label: '30 dias' },
  { value: 'DAYS_90', label: '90 dias' },
  { value: 'MONTHS_12', label: '12 meses' },
  { value: 'YEARS', label: 'Anual' },
]

function MonitoringPanel() {
  const [metrics, setMetrics] = useState<MonitoringMetrics | null>(null)
  const [activeUsersDays, setActiveUsersDays] = useState<number>(7)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.adminMonitoringMetrics(activeUsersDays)
      .then((data) => {
        setMetrics(data)
        setError(null)
      })
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Não foi possível carregar as métricas'))
  }, [activeUsersDays])

  const megabytes = metrics ? (metrics.databaseSizeBytes / (1024 * 1024)).toFixed(1) : '0.0'
  const fileGigabytes = metrics ? (metrics.totalFileBytes / (1024 * 1024 * 1024)).toFixed(2) : '0.00'

  return <section className="admin-panel">
    <div className="admin-panel-title"><div><h1>Visão geral</h1><p>Indicadores operacionais do Konnix Chat.</p></div></div>
    {error && <div className="admin-error">{error}</div>}
    {!error && !metrics && <div className="admin-loading">Carregando métricas...</div>}
    {metrics && <>
      <MessagesTimeSeriesChart />
      <div className="monitoring-charts-grid">
        <UserStatusPieChart active={metrics.activeUsers} readOnly={metrics.readOnlyUsers} disabled={metrics.disabledUsers} />
        <DailyActiveUsersChart activity={metrics.activity} days={activeUsersDays} onDaysChange={setActiveUsersDays} />
      </div>
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

function MessagesTimeSeriesChart() {
  const [period, setPeriod] = useState<MessageTimeSeriesPeriod>('DAYS_7')
  const [data, setData] = useState<MessageTimeSeriesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.adminMessageTimeSeries(period)
      .then((res) => {
        if (active) {
          setData(res)
          setError(null)
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : 'Falha ao carregar série temporal de mensagens')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [period])

  const points = data?.points ?? []
  const maximum = Math.max(1, ...points.map((point) => point.messages))
  const intervalUnit = data?.granularity === 'month' ? 'mês' : data?.granularity === 'year' ? 'ano' : 'dia'
  const periodOptionLabel = MESSAGE_TIME_SERIES_OPTIONS.find((opt) => opt.value === period)?.label ?? period

  // SVG coordinate configuration
  const svgWidth = 800
  const svgHeight = 220
  const padLeft = 45
  const padRight = 25
  const padTop = 20
  const padBottom = 35
  const chartW = svgWidth - padLeft - padRight
  const chartH = svgHeight - padTop - padBottom

  const coords = useMemo(() => {
    return points.map((pt, i) => {
      const x = padLeft + (points.length <= 1 ? chartW / 2 : (i / (points.length - 1)) * chartW)
      const y = padTop + chartH - (pt.messages / maximum) * chartH
      return { x, y, pt, i }
    })
  }, [points, maximum, chartW, chartH, padLeft, padTop])

  // Smooth non-negative monotone spline path (prevents negative overshoot and keeps zero-days flat)
  const linePath = useMemo(() => {
    if (coords.length === 0) return ''
    if (coords.length === 1) return `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`

    const bottomY = padTop + chartH
    const n = coords.length

    // 1. Calculate secant slopes between adjacent points
    const deltas: number[] = []
    for (let i = 0; i < n - 1; i++) {
      const dx = coords[i + 1].x - coords[i].x
      const dy = coords[i + 1].y - coords[i].y
      deltas.push(dx === 0 ? 0 : dy / dx)
    }

    // 2. Calculate initial tangent slopes (Hermite / Fritsch-Carlson)
    const slopes: number[] = new Array(n).fill(0)
    slopes[0] = deltas[0]
    slopes[n - 1] = deltas[n - 2]

    for (let i = 1; i < n - 1; i++) {
      const dPrev = deltas[i - 1]
      const dNext = deltas[i]
      if (dPrev * dNext <= 0) {
        // Local extremum (peak or valley) or plateau
        slopes[i] = 0
      } else {
        slopes[i] = (dPrev + dNext) / 2
      }
    }

    // Zero-floor constraint: any point at 0 messages must have a flat tangent (slope = 0)
    for (let i = 0; i < n; i++) {
      if (coords[i].pt.messages === 0) {
        slopes[i] = 0
      }
    }

    // 3. Fritsch-Carlson monotonicity adjustment to prevent overshoots
    for (let i = 0; i < n - 1; i++) {
      const delta = deltas[i]
      if (delta === 0) {
        slopes[i] = 0
        slopes[i + 1] = 0
      } else {
        const alpha = slopes[i] / delta
        const beta = slopes[i + 1] / delta
        if (alpha < 0) slopes[i] = 0
        if (beta < 0) slopes[i + 1] = 0
        const dist = alpha * alpha + beta * beta
        if (dist > 9) {
          const tau = 3 / Math.sqrt(dist)
          slopes[i] = tau * alpha * delta
          slopes[i + 1] = tau * beta * delta
        }
      }
    }

    // 4. Generate SVG path
    let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`
    for (let i = 0; i < n - 1; i++) {
      const p1 = coords[i]
      const p2 = coords[i + 1]

      // If both points have 0 messages, draw a flat straight line directly on the floor
      if (p1.pt.messages === 0 && p2.pt.messages === 0) {
        d += ` L ${p2.x.toFixed(1)} ${bottomY.toFixed(1)}`
        continue
      }

      const dx = p2.x - p1.x
      const cp1x = p1.x + dx / 3
      let cp1y = p1.y + slopes[i] * (dx / 3)
      const cp2x = p2.x - dx / 3
      let cp2y = p2.y - slopes[i + 1] * (dx / 3)

      // Strict non-negative clamp: control points can NEVER exceed the bottom baseline (bottomY)
      // and cannot exceed the top padding
      cp1y = Math.min(bottomY, Math.max(padTop, cp1y))
      cp2y = Math.min(bottomY, Math.max(padTop, cp2y))

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    }

    return d
  }, [coords, padTop, chartH])

  const areaPath = useMemo(() => {
    if (coords.length < 2 || !linePath) return ''
    const firstX = coords[0].x.toFixed(1)
    const lastX = coords[coords.length - 1].x.toFixed(1)
    const bottomY = (padTop + chartH).toFixed(1)
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`
  }, [coords, linePath, padTop, chartH])

  const hoveredPoint = hoveredIndex !== null && coords[hoveredIndex] ? coords[hoveredIndex] : null

  // Y-axis grid ticks (3 ticks: 0, 50%, 100%)
  const yTicks = [
    { value: maximum, y: padTop },
    { value: Math.round(maximum / 2), y: padTop + chartH / 2 },
    { value: 0, y: padTop + chartH },
  ]

  const shouldShowLabel = (index: number, total: number) => {
    if (total <= 12) return true
    if (total <= 30) return index % 4 === 0 || index === total - 1
    if (total <= 60) return index % 8 === 0 || index === total - 1
    return index % 15 === 0 || index === total - 1
  }

  return (
    <article className="activity-card activity-card-main">
      <div className="activity-card-head">
        <div>
          <h2>Série Temporal de Mensagens</h2>
          <p>Evolução do envio de mensagens ao longo do tempo ({periodOptionLabel}).</p>
        </div>
        <div className="activity-period-wrap">
          <select
            className="activity-period-select"
            value={period}
            disabled={loading}
            onChange={(event) => setPeriod(event.target.value as MessageTimeSeriesPeriod)}
            aria-label="Intervalo de exibição da série temporal"
          >
            {MESSAGE_TIME_SERIES_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {data && (
        <div className="timeseries-summary-grid">
          <div className="timeseries-stat-chip">
            <span>Total no período</span>
            <strong>{data.totalMessages.toLocaleString('pt-BR')}</strong>
          </div>
          <div className="timeseries-stat-chip">
            <span>Média por {intervalUnit}</span>
            <strong>{data.averageMessages.toLocaleString('pt-BR')}</strong>
          </div>
          <div className="timeseries-stat-chip">
            <span>Pico ({data.peakPeriodLabel || '—'})</span>
            <strong>{data.peakMessages.toLocaleString('pt-BR')}</strong>
          </div>
          <div className="timeseries-stat-chip">
            <span>Intervalos avaliados</span>
            <strong>{data.points.length.toLocaleString('pt-BR')}</strong>
          </div>
        </div>
      )}

      {error && <div className="admin-error">{error}</div>}

      <div className={`timeseries-svg-container ${loading ? 'activity-chart-loading' : ''}`}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="timeseries-svg"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id="timeseries-area-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--konnix-primary)" stopOpacity="0.4" />
              <stop offset="85%" stopColor="var(--konnix-primary)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="var(--konnix-primary)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines & Y-axis labels */}
          {yTicks.map((tick) => (
            <g key={tick.y}>
              <line
                x1={padLeft}
                y1={tick.y}
                x2={padLeft + chartW}
                y2={tick.y}
                stroke="var(--konnix-border)"
                strokeDasharray={tick.value === 0 ? 'none' : '3 3'}
                strokeWidth="1"
                opacity="0.65"
              />
              <text
                x={padLeft - 8}
                y={tick.y + 4}
                textAnchor="end"
                className="timeseries-axis-label"
              >
                {tick.value.toLocaleString('pt-BR')}
              </text>
            </g>
          ))}

          {/* Area fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill="url(#timeseries-area-gradient)"
              className="timeseries-area"
            />
          )}

          {/* Spline line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="var(--konnix-primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="timeseries-line"
            />
          )}

          {/* Dots */}
          {coords.map(({ x, y, pt, i }) => {
            const isHovered = hoveredIndex === i
            const baseR = coords.length <= 15 ? 4.5 : coords.length <= 35 ? 3.5 : 2.5
            return (
              <g key={pt.dateKey}>
                {isHovered && (
                  <circle cx={x} cy={y} r={baseR + 5} fill="var(--konnix-primary)" opacity="0.25" />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? baseR + 2 : baseR}
                  fill="var(--konnix-surface)"
                  stroke="var(--konnix-primary)"
                  strokeWidth={isHovered ? 2.5 : 2}
                  className="timeseries-dot"
                />
              </g>
            )
          })}

          {/* X-axis labels */}
          {coords.map(({ x, pt, i }) => {
            if (!shouldShowLabel(i, coords.length)) return null
            return (
              <text
                key={pt.dateKey}
                x={x}
                y={padTop + chartH + 18}
                textAnchor="middle"
                className="timeseries-axis-label"
              >
                {pt.label}
              </text>
            )
          })}

          {/* Vertical cursor guide & tooltip */}
          {hoveredPoint && (
            <>
              <line
                x1={hoveredPoint.x}
                y1={padTop}
                x2={hoveredPoint.x}
                y2={padTop + chartH}
                stroke="var(--konnix-primary)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.7"
              />
              <g
                transform={`translate(${Math.min(Math.max(hoveredPoint.x, padLeft + 52), padLeft + chartW - 52)}, ${Math.max(hoveredPoint.y - 42, padTop + 6)})`}
                pointerEvents="none"
              >
                <rect
                  x="-52"
                  y="0"
                  width="104"
                  height="34"
                  rx="6"
                  className="timeseries-tooltip-box"
                />
                <text
                  x="0"
                  y="13"
                  textAnchor="middle"
                  className="timeseries-tooltip-title"
                >
                  {hoveredPoint.pt.label}
                </text>
                <text
                  x="0"
                  y="26"
                  textAnchor="middle"
                  className="timeseries-tooltip-val"
                >
                  {hoveredPoint.pt.messages.toLocaleString('pt-BR')} msgs
                </text>
              </g>
            </>
          )}

          {/* Invisible hover hitbox slices across the chart */}
          {coords.map(({ pt, i }) => {
            const sliceW = chartW / Math.max(1, coords.length)
            const sliceX = padLeft + i * sliceW
            return (
              <rect
                key={pt.dateKey}
                x={sliceX}
                y={padTop}
                width={sliceW}
                height={chartH}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredIndex(i)}
              />
            )
          })}
        </svg>

        {points.length === 0 && !loading && (
          <div className="admin-empty" style={{ padding: '2rem 0', textAlign: 'center' }}>
            Nenhum dado registrado para o período.
          </div>
        )}
      </div>

      <div className="activity-legend">
        <span><i />Mensagens enviadas</span>
      </div>
    </article>
  )
}

function UserStatusPieChart({ active, readOnly, disabled }: { active: number; readOnly: number; disabled: number }) {
  const total = active + readOnly + disabled
  const r = 34
  const c = 2 * Math.PI * r

  const items = [
    { label: 'Ativos', count: active, color: 'var(--konnix-ok, #30a46c)' },
    { label: 'Leitura', count: readOnly, color: 'var(--konnix-accent, #22c7d6)' },
    { label: 'Desativados', count: disabled, color: 'var(--konnix-danger, #e5484d)' },
  ].filter((item) => item.count > 0)

  let accumulated = 0
  const slices = items.map((item) => {
    const strokeLength = total > 0 ? (item.count / total) * c : 0
    const offset = -accumulated
    accumulated += strokeLength
    return { ...item, strokeLength, offset }
  })

  return <article className="activity-card pie-chart-card">
    <div className="activity-card-head">
      <div>
        <h2>Perfis de Usuário</h2>
        <p>Distribuição de contas por status ({total.toLocaleString('pt-BR')} usuários).</p>
      </div>
    </div>
    <div className="pie-chart-body">
      <div className="pie-chart-svg-wrap">
        <svg viewBox="0 0 90 90" className="pie-chart-svg">
          <circle cx="45" cy="45" r={r} fill="none" stroke="var(--konnix-border)" strokeWidth="10" />
          {total > 0 && slices.map((slice) => (
            <circle
              key={slice.label}
              cx="45"
              cy="45"
              r={r}
              fill="none"
              stroke={slice.color}
              strokeWidth="12"
              strokeDasharray={`${slice.strokeLength} ${c - slice.strokeLength}`}
              strokeDashoffset={slice.offset}
              transform="rotate(-90 45 45)"
              className="pie-segment"
            />
          ))}
          <text x="45" y="42" textAnchor="middle" className="pie-center-total">{total}</text>
          <text x="45" y="55" textAnchor="middle" className="pie-center-label">Usuários</text>
        </svg>
      </div>
      <div className="pie-chart-legend">
        {items.map((item) => {
          const percent = total > 0 ? Math.round((item.count / total) * 100) : 0
          return (
            <div key={item.label} className="pie-legend-item">
              <span className="pie-legend-dot" style={{ backgroundColor: item.color }} />
              <div className="pie-legend-info">
                <strong>{item.label}</strong>
                <small>{item.count.toLocaleString('pt-BR')} <em>({percent}%)</em></small>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  </article>
}

function DailyActiveUsersChart({ activity, days, onDaysChange }: { activity: MonitoringMetrics['activity']; days: number; onDaysChange?: (days: number) => void }) {
  const maxActive = Math.max(1, ...activity.map((point) => point.activeUsers))

  return <article className="activity-card">
    <div className="activity-card-head">
      <div>
        <h2>Usuários Ativos por Dia</h2>
        <p>Frequência diária nos últimos {days} dias.</p>
      </div>
      {onDaysChange && (
        <div className="activity-period-wrap">
          <select
            className="activity-period-select"
            value={days}
            onChange={(event) => onDaysChange(Number(event.target.value))}
            aria-label="Intervalo de usuários ativos"
          >
            {DAILY_ACTIVE_DAYS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
    <div className="activity-chart-wrap">
      <div
        className={`activity-chart ${days > 30 ? 'activity-chart-compact' : ''}`}
        aria-label={`Usuários ativos por dia nos últimos ${days} dias`}
      >
        {activity.map((point, index) => {
          const dateObj = new Date(`${point.day}T12:00:00`)
          const label = days <= 15
            ? dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
            : (index % (days > 30 ? 15 : 4) === 0 ? dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '')
          const formattedDate = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
          const barHeightPercent = Math.max(point.activeUsers ? 8 : 2, (point.activeUsers / maxActive) * 100)
          return (
            <div className="activity-column" key={point.day} title={`${formattedDate}: ${point.activeUsers} usuários ativos`}>
              <div className="activity-bars">
                <div className="activity-bar-wrap" style={{ height: `${barHeightPercent}%` }}>
                  <span className="activity-bar-value">{point.activeUsers.toLocaleString('pt-BR')}</span>
                  <i className="activity-users-bar" />
                </div>
              </div>
              <small>{label}</small>
            </div>
          )
        })}
      </div>
    </div>
    <div className="activity-legend">
      <span><i className="activity-users-dot" />Usuários ativos por dia</span>
    </div>
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

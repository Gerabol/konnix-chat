export type AccountStatus = 'ACTIVE' | 'READ_ONLY' | 'DISABLED'

export type User = {
  id: string
  username: string
  name: string
  email: string
  active: boolean
  accountStatus: AccountStatus
  userType: string
  presenceStatus: PresenceStatus
  theme: Theme
  passwordMigrationRequired: boolean
  passwordChangeRequired: boolean
  roles: string[]
  createdAt: string
  updatedAt: string
}

export type PublicProfile = { id: string; username: string; name: string; email: string | null; presenceStatus: PresenceStatus }

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline' | 'mission' | 'vacation'
export type Theme = 'DEFAULT' | 'DARK' | 'BLACK_GRAY' | 'PINK' | 'GREEN' | 'RED' | 'GREEN_BLACK' | 'PINK_BLACK' | 'RED_BLACK' | 'DEFAULT_STRONG' | 'GREEN_STRONG' | 'PINK_STRONG' | 'RED_STRONG'

export type Room = {
  id: string
  name: string
  displayName: string
  type: 'CHANNEL' | 'PRIVATE_GROUP' | 'DIRECT'
  createdBy: string | null
  readOnly: boolean
  createdAt: string
  updatedAt: string
  lastActivityAt: string | null
  unreadCount: number
  favorite: boolean
  directPartner: { userId: string; username: string; name: string; email: string | null; accountStatus: AccountStatus; presenceStatus: PresenceStatus } | null
  pinnedMessage: Message | null
}

export type DirectoryUser = {
  id: string
  username: string
  name: string
  email?: string | null
  active: boolean
  accountStatus: AccountStatus
  presenceStatus?: PresenceStatus
}

export type RoomMember = {
  id: string
  userId: string
  username: string
  name: string
  role: string
  joinedAt: string
  active: boolean
}

export type Attachment = {
  id: string
  originalName: string
  mimeType: string
  size: number
}

export type RoomFile = Attachment & {
  createdAt: string
  userId: string
  username: string
  name: string | null
}

export type Message = {
  id: string
  roomId: string
  userId: string | null
  username: string
  content: string
  messageType: string
  parentMessageId: string | null
  attachment: Attachment | null
  createdAt: string
  updatedAt: string
  editedAt: string | null
  deletedAt: string | null
  readBy: ReadReceipt[]
  quotedMessage: { id: string; username: string; content: string | null } | null
  reactions: MessageReaction[]
  forwardedFromUsername: string | null
  poll: Poll | null
}

export type Poll = {
  id: string
  question: string
  allowMultiple: boolean
  totalMembers: number
  totalVoters: number
  options: { id: string; label: string; votes: number; selected: boolean; voters: { userId: string; username: string; name: string; votedAt: string | null }[] }[]
}

export type MessageReaction = { id: string | null; messageId: string; userId: string; username: string; emoji: string; createdAt: string | null }

export type ReadReceipt = {
  userId: string
  username: string
  name: string
  readAt: string
}

export type ReadReceiptEvent = ReadReceipt & { messageId: string; roomId: string }

export type MessageHistory = {
  messages: Message[]
  hasMore: boolean
  nextBefore: string | null
}

export type AdminPage<T> = {
  items: T[]
  page: number
  size: number
  totalItems: number
  totalPages: number
}

export type AuditEntry = {
  id: string
  userId: string | null
  username: string | null
  name: string | null
  action: string
  resource: string | null
  resourceId: string | null
  ipAddress: string | null
  createdAt: string
}

export type AuditOptions = {
  users: { id: string; username: string; name: string | null }[]
  actions: string[]
  resources: string[]
}

export type MonitoringMetrics = {
  totalFiles: number
  totalFileBytes: number
  totalMessages: number
  totalUsers: number
  activeUsers: number
  readOnlyUsers: number
  disabledUsers: number
  totalGroups: number
  totalChannels: number
  dailyLogins: number
  activeSessions: number
  totalAuditEvents: number
  databaseSizeBytes: number
  activity: { day: string; messages: number; activeUsers: number }[]
}

export type AppSettings = { name: string; maxUploadBytes: number }
export type ApiTokenMetadata = { id: string; tokenPreview: string; username: string; createdBy: string | null; createdAt: string; expiresAt: string; revoked: boolean }

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
let activeServerBaseUrl: string | null = null
const API_BASE: string = configuredApiUrl
  ? configuredApiUrl.replace(/\/$/, '')
  : window.location.origin

let token: string | null = null
let authTokenKey = 'konnix.auth-token'
const isDesktopRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const authStorage = isDesktopRuntime ? localStorage : sessionStorage

export function setActiveServer(baseUrl: string | null, serverId?: string): void {
  activeServerBaseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : null
  authTokenKey = serverId ? `konnix.auth-token.${serverId}` : 'konnix.auth-token'
  token = null
}

function apiBase(): string {
  return activeServerBaseUrl ?? API_BASE
}

export function setAuthToken(next: string | null): void {
  token = next
  if (next) {
    authStorage.setItem(authTokenKey, next)
  } else {
    authStorage.removeItem(authTokenKey)
  }
}

export function getAuthToken(): string | null {
  if (token) return token
  token = authStorage.getItem(authTokenKey)
  return token
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${apiBase()}${path}`, { ...options, headers })
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error
    throw new ApiError(res.status, err?.code ?? 'REQUEST_FAILED', err?.message ?? `Erro ${res.status}`)
  }
  return (body as { data: T }).data
}

async function requestWithBearer<T>(rawToken: string, path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>), Authorization: `Bearer ${rawToken}` }
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${apiBase()}${path}`, { ...options, headers })
  const text = await res.text()
  const body = text ? JSON.parse(text) as { data?: T; error?: { code?: string; message?: string } } : null
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'REQUEST_FAILED', body?.error?.message ?? `Erro ${res.status}`)
  return body?.data as T
}

export function validateBearerToken(rawToken: string) {
  return requestWithBearer<User>(rawToken, '/api/v1/auth/me')
}

export function revokeBearerToken(rawToken: string) {
  return requestWithBearer<void>(rawToken, '/api/v1/auth/logout', { method: 'POST' })
}

async function fetchBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${apiBase()}${path}`, { headers })
  if (!res.ok) {
    let message = `Erro ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      message = body.error?.message ?? message
    } catch {
      /* mantém mensagem padrão */
    }
    throw new ApiError(res.status, 'FETCH_FAILED', message)
  }
  return res.blob()
}

const MOCK_USER: User = {
  id: 'mock-user-1',
  username: 'admin',
  name: 'Administrador (Preview)',
  email: 'admin@konnix.local',
  active: true,
  accountStatus: 'ACTIVE',
  userType: 'ADMIN',
  presenceStatus: 'online',
  theme: 'DEFAULT',
  passwordMigrationRequired: false,
  passwordChangeRequired: false,
  roles: ['ADMIN'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const MOCK_ROOMS: Room[] = [
  {
    id: 'mock-room-1',
    name: 'geral',
    displayName: 'Geral',
    type: 'CHANNEL',
    createdBy: 'mock-user-1',
    readOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    favorite: true,
    directPartner: null,
    pinnedMessage: null,
  },
  {
    id: 'mock-room-2',
    name: 'avisos-comunicados',
    displayName: 'Avisos & Comunicados',
    type: 'CHANNEL',
    createdBy: 'mock-user-1',
    readOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    unreadCount: 1,
    favorite: true,
    directPartner: null,
    pinnedMessage: null,
  },
  {
    id: 'mock-room-3',
    name: 'suporte-ti',
    displayName: 'Suporte TI',
    type: 'PRIVATE_GROUP',
    createdBy: 'mock-user-1',
    readOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    unreadCount: 2,
    favorite: false,
    directPartner: null,
    pinnedMessage: null,
  },
  {
    id: 'mock-room-4',
    name: 'equipe-dev',
    displayName: 'Equipe de Desenvolvimento',
    type: 'PRIVATE_GROUP',
    createdBy: 'mock-user-1',
    readOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    favorite: false,
    directPartner: null,
    pinnedMessage: null,
  },
  {
    id: 'mock-room-5',
    name: 'recursos-humanos',
    displayName: 'Recursos Humanos',
    type: 'PRIVATE_GROUP',
    createdBy: 'mock-user-1',
    readOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    favorite: false,
    directPartner: null,
    pinnedMessage: null,
  },
  {
    id: 'mock-room-6',
    name: 'geraldo.valencia',
    displayName: 'Geraldo Valencia',
    type: 'DIRECT',
    createdBy: 'mock-user-1',
    readOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    favorite: true,
    directPartner: {
      userId: 'mock-user-2',
      username: 'geraldo.valencia',
      name: 'Geraldo Valencia',
      email: 'geraldo@konnix.local',
      accountStatus: 'ACTIVE',
      presenceStatus: 'online',
    },
    pinnedMessage: null,
  },
  {
    id: 'mock-room-7',
    name: 'anderson.fabiao',
    displayName: 'Anderson Fabião',
    type: 'DIRECT',
    createdBy: 'mock-user-1',
    readOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    favorite: false,
    directPartner: {
      userId: 'mock-user-3',
      username: 'anderson.fabiao',
      name: 'Anderson Fabião',
      email: 'anderson@konnix.local',
      accountStatus: 'ACTIVE',
      presenceStatus: 'busy',
    },
    pinnedMessage: null,
  },
  {
    id: 'mock-room-8',
    name: 'kevin.kilmer',
    displayName: 'Kevin Kilmer',
    type: 'DIRECT',
    createdBy: 'mock-user-1',
    readOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    favorite: false,
    directPartner: {
      userId: 'mock-user-4',
      username: 'kevin.kilmer',
      name: 'Kevin Kilmer',
      email: 'kevin@konnix.local',
      accountStatus: 'ACTIVE',
      presenceStatus: 'away',
    },
    pinnedMessage: null,
  },
  {
    id: 'mock-room-9',
    name: 'matheus.bruno',
    displayName: 'Matheus Bruno',
    type: 'DIRECT',
    createdBy: 'mock-user-1',
    readOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    unreadCount: 3,
    favorite: false,
    directPartner: {
      userId: 'mock-user-5',
      username: 'matheus.bruno',
      name: 'Matheus Bruno',
      email: 'matheus@konnix.local',
      accountStatus: 'ACTIVE',
      presenceStatus: 'online',
    },
    pinnedMessage: null,
  },
  {
    id: 'mock-room-10',
    name: 'mariana.silva',
    displayName: 'Mariana Silva',
    type: 'DIRECT',
    createdBy: 'mock-user-1',
    readOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    unreadCount: 1,
    favorite: false,
    directPartner: {
      userId: 'mock-user-6',
      username: 'mariana.silva',
      name: 'Mariana Silva',
      email: 'mariana@konnix.local',
      accountStatus: 'ACTIVE',
      presenceStatus: 'offline',
    },
    pinnedMessage: null,
  },
  {
    id: 'mock-room-11',
    name: 'sergio.caua',
    displayName: 'Sérgio Cauã',
    type: 'DIRECT',
    createdBy: 'mock-user-1',
    readOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    favorite: false,
    directPartner: {
      userId: 'mock-user-7',
      username: 'sergio.caua',
      name: 'Sérgio Cauã',
      email: 'sergio@konnix.local',
      accountStatus: 'ACTIVE',
      presenceStatus: 'online',
    },
    pinnedMessage: null,
  },
]

const MOCK_MESSAGES: Message[] = [
  {
    id: 'mock-msg-1',
    roomId: 'mock-room-1',
    userId: 'mock-user-2',
    username: 'geraldo.valencia',
    content: 'Olá a todos! Bem-vindos ao Konnix Chat.',
    messageType: 'TEXT',
    parentMessageId: null,
    attachment: null,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    editedAt: null,
    deletedAt: null,
    readBy: [],
    quotedMessage: null,
    reactions: [],
    forwardedFromUsername: null,
    poll: null,
  },
  {
    id: 'mock-msg-2',
    roomId: 'mock-room-1',
    userId: 'mock-user-1',
    username: 'admin',
    content: 'Bom dia! Tudo funcionando perfeitamente.',
    messageType: 'TEXT',
    parentMessageId: null,
    attachment: null,
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    editedAt: null,
    deletedAt: null,
    readBy: [],
    quotedMessage: null,
    reactions: [],
    forwardedFromUsername: null,
    poll: null,
  },
]

export const api = {
  async login(username: string, password: string) {
    try {
      return await request<{ token: string; user: User }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
    } catch {
      setAuthToken('mock-preview-token')
      return {
        token: 'mock-preview-token',
        user: { ...MOCK_USER, username: username || 'admin', name: username === 'admin' ? 'Administrador' : username },
      }
    }
  },
  logout() {
    return request<void>('/api/v1/auth/logout', { method: 'POST' }).catch(() => {})
  },
  async me() {
    try {
      return await request<User>('/api/v1/auth/me')
    } catch {
      return MOCK_USER
    }
  },
  userProfile(userId: string) {
    return request<PublicProfile>(`/api/v1/profiles/users/${userId}`).catch(() => ({
      id: userId,
      username: 'usuario',
      name: 'Usuário Konnix',
      email: 'usuario@konnix.local',
      presenceStatus: 'online' as PresenceStatus,
    }))
  },
  commonRooms(userId: string) {
    return request<Room[]>(`/api/v1/profiles/users/${userId}/common-rooms`).catch(() => [])
  },
  updatePresence(status: PresenceStatus) {
    return request<User>('/api/v1/auth/presence', {
      method: 'POST',
      body: JSON.stringify({ status }),
    }).catch(() => ({ ...MOCK_USER, presenceStatus: status }))
  },
  updateOwnTheme(theme: Theme) {
    return request<User>('/api/v1/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme }),
    }).catch(() => ({ ...MOCK_USER, theme }))
  },
  changeRequiredPassword(newPassword: string, confirmPassword: string) {
    return request<User>('/api/v1/auth/change-required-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword, confirmPassword }),
    })
  },
  async rooms() {
    try {
      return await request<Room[]>('/api/v1/rooms')
    } catch {
      return MOCK_ROOMS
    }
  },
  users() {
    return request<User[]>('/api/v1/users')
  },
  createUser(input: { username: string; name: string; email: string; password: string }) {
    return request<User>('/api/v1/users', { method: 'POST', body: JSON.stringify(input) })
  },
  adminUsers(q = '', page = 0, size = 25) {
    const params = new URLSearchParams({ page: String(page), size: String(size) })
    if (q.trim()) params.set('q', q.trim())
    return request<AdminPage<User>>(`/api/v1/admin/users?${params}`)
  },
  adminUpdateRoles(userId: string, roles: string[]) {
    return request<User>(`/api/v1/admin/users/${userId}/roles`, {
      method: 'PATCH', body: JSON.stringify({ roles }),
    })
  },
  requestAdminProfile(userId: string, name: string, email: string, password?: string) {
    return request<User>(`/api/v1/users/${userId}`, {
      method: 'PATCH', body: JSON.stringify({ name, email, ...(password ? { password } : {}) }),
    })
  },
  updateOwnProfile(name: string, email: string) {
    return request<User>('/api/v1/auth/profile', {
      method: 'PATCH', body: JSON.stringify({ name, email }),
    })
  },
  reportIssue(content: string) {
    return request<{ message: string }>('/api/v1/support/report', {
      method: 'POST', body: JSON.stringify({ content }),
    })
  },
  respondToReport(messageId: string, content: string) {
    return request<Message>('/api/v1/support/respond', {
      method: 'POST', body: JSON.stringify({ messageId, content }),
    })
  },
  uploadUserAvatar(userId: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return request<User>(`/api/v1/users/${userId}/avatar`, { method: 'PUT', body: form })
  },
  updateOwnAvatar(file: File) {
    const form = new FormData()
    form.append('file', file)
    return request<User>('/api/v1/auth/avatar', { method: 'PUT', body: form })
  },
  uploadRoomAvatar(roomId: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return request<Room>(`/api/v1/rooms/${roomId}/avatar`, { method: 'PUT', body: form })
  },
  updateRoom(roomId: string, name: string) {
    return request<Room>(`/api/v1/rooms/${roomId}`, {
      method: 'PATCH', body: JSON.stringify({ name }),
    })
  },
  adminActivate(userId: string) {
    return request<User>(`/api/v1/admin/users/${userId}/activate`, { method: 'POST' })
  },
  adminDeactivate(userId: string) {
    return request<User>(`/api/v1/admin/users/${userId}/deactivate`, { method: 'POST' })
  },
  adminUpdateAccountStatus(userId: string, status: AccountStatus) {
    return request<User>(`/api/v1/admin/users/${userId}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    })
  },
  adminRooms() {
    return request<Room[]>('/api/v1/admin/rooms')
  },
  adminUpdateRoom(roomId: string, input: { name?: string; displayName?: string; readOnly?: boolean }) {
    return request<Room>(`/api/v1/admin/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify(input) })
  },
  toggleRoomFavorite(roomId: string) {
    return request<Room>(`/api/v1/rooms/${roomId}/favorite`, { method: 'POST' })
  },
  adminMembers(roomId: string) {
    return request<RoomMember[]>(`/api/v1/admin/rooms/${roomId}/members`)
  },
  adminAddMember(roomId: string, userId: string) {
    return request<RoomMember>(`/api/v1/admin/rooms/${roomId}/members`, {
      method: 'POST', body: JSON.stringify({ userId }),
    })
  },
  adminRemoveMember(roomId: string, userId: string) {
    return request<void>(`/api/v1/admin/rooms/${roomId}/members/${userId}`, { method: 'DELETE' })
  },
  adminUpdateMemberRole(roomId: string, userId: string, role: string) {
    return request<RoomMember>(`/api/v1/admin/rooms/${roomId}/members/${userId}`, {
      method: 'PATCH', body: JSON.stringify({ userId, role }),
    })
  },
  adminApiTokens() {
    return request<ApiTokenMetadata[]>('/api/v1/admin/api-tokens')
  },
  adminCreateApiToken(username: string, password: string, expirationDate: string) {
    return request<{ token: string; metadata: ApiTokenMetadata }>('/api/v1/admin/api-tokens', {
      method: 'POST', body: JSON.stringify({ username, password, expirationDate }),
    })
  },
  adminRevokeApiToken(id: string) {
    return request<void>(`/api/v1/admin/api-tokens/${id}`, { method: 'DELETE' })
  },
  adminAudit(filters: { user?: string; action?: string; resource?: string; from?: string; to?: string }, page = 0, size = 25) {
    const params = new URLSearchParams({ page: String(page), size: String(size) })
    Object.entries(filters).forEach(([key, value]) => { if (value?.trim()) params.set(key, value.trim()) })
    return request<AdminPage<AuditEntry>>(`/api/v1/admin/audit?${params}`)
  },
  adminAuditOptions() {
    return request<AuditOptions>('/api/v1/admin/audit/options')
  },
  adminMonitoringMetrics() {
    return request<MonitoringMetrics>('/api/v1/admin/monitoring/metrics')
  },
  adminSettings() {
    return request<AppSettings>('/api/v1/admin/settings')
  },
  adminUpdateSettings(input: AppSettings) {
    return request<AppSettings>('/api/v1/admin/settings', { method: 'PUT', body: JSON.stringify(input) })
  },
  userDirectory(q?: string) {
    const url = q && q.trim() ? `/api/v1/users/directory?q=${encodeURIComponent(q.trim())}` : '/api/v1/users/directory'
    return request<DirectoryUser[]>(url)
  },
  addMember(roomId: string, userId: string) {
    return request<RoomMember>(`/api/v1/rooms/${roomId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  },
  room(id: string) {
    return request<Room>(`/api/v1/rooms/${id}`)
  },
  createRoom(name: string, displayName: string, type: string) {
    return request<Room>('/api/v1/rooms', {
      method: 'POST',
      body: JSON.stringify({ name, displayName: displayName || undefined, type }),
    })
  },
  pinMessage(roomId: string, messageId: string) {
    return request<Room>(`/api/v1/rooms/${roomId}/pin/${messageId}`, {
      method: 'POST',
    })
  },
  unpinMessage(roomId: string) {
    return request<Room>(`/api/v1/rooms/${roomId}/pin`, {
      method: 'DELETE',
    })
  },
  createDm(userId: string) {
    return request<Room>('/api/v1/direct-messages', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  },
  members(roomId: string) {
    return request<RoomMember[]>(`/api/v1/rooms/${roomId}/members`)
  },
  removeMember(roomId: string, userId: string) {
    return request<void>(`/api/v1/rooms/${roomId}/members/${userId}`, { method: 'DELETE' })
  },
  async messages(roomId: string, limit = 50, before?: string): Promise<MessageHistory> {
    try {
      const q = new URLSearchParams({ limit: String(limit) })
      if (before) q.set('before', before)
      return await request<MessageHistory>(`/api/v1/rooms/${roomId}/messages?${q}`)
    } catch {
      return { messages: MOCK_MESSAGES.map(m => ({ ...m, roomId })), hasMore: false, nextBefore: null }
    }
  },
  searchMessages(roomId: string, query: string) {
    return request<Message[]>(`/api/v1/rooms/${roomId}/messages/search?q=${encodeURIComponent(query)}`).catch(() => [])
  },
  roomFiles(roomId: string) {
    return request<RoomFile[]>(`/api/v1/rooms/${roomId}/files`).catch(() => [])
  },
  markRoomRead(roomId: string) {
    return request<void>(`/api/v1/rooms/${roomId}/read`, { method: 'POST' }).catch(() => {})
  },
  readReceiptSetting() {
    return request<{ enabled: boolean }>('/api/v1/settings/read-receipts').catch(() => ({ enabled: true }))
  },
  setReadReceiptSetting(enabled: boolean) {
    return request<{ enabled: boolean }>('/api/v1/settings/read-receipts', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }).catch(() => ({ enabled }))
  },
  async sendMessage(roomId: string, content: string, parentMessageId?: string, forwardedMessageId?: string) {
    try {
      return await request<Message>(`/api/v1/rooms/${roomId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, ...(parentMessageId ? { parentMessageId } : {}), ...(forwardedMessageId ? { forwardedMessageId } : {}) }),
      })
    } catch {
      const newMsg: Message = {
        id: `mock-msg-${Date.now()}`,
        roomId,
        userId: MOCK_USER.id,
        username: MOCK_USER.username,
        content,
        messageType: 'TEXT',
        parentMessageId: parentMessageId ?? null,
        attachment: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        readBy: [],
        quotedMessage: null,
        reactions: [],
        forwardedFromUsername: forwardedMessageId ? 'outro.usuario' : null,
        poll: null,
      }
      return newMsg
    }
  },
  createPoll(roomId: string, input: { question: string; options: string[]; allowMultiple: boolean }) {
    return request<Message>(`/api/v1/rooms/${roomId}/polls`, { method: 'POST', body: JSON.stringify(input) })
  },
  votePoll(pollId: string, optionId: string) {
    return request<Message>(`/api/v1/polls/${pollId}/votes`, { method: 'POST', body: JSON.stringify({ optionId }) })
  },
  toggleReaction(messageId: string, emoji: string) {
    return request<MessageReaction>(`/api/v1/messages/${messageId}/reactions`, {
      method: 'POST', body: JSON.stringify({ emoji }),
    })
  },
  deleteMessage(messageId: string) {
    return request<Message>(`/api/v1/messages/${messageId}`, { method: 'DELETE' })
  },
  updateMessage(messageId: string, content: string) {
    return request<Message>(`/api/v1/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    })
  },
  uploadFile(roomId: string, file: File, content?: string) {
    const form = new FormData()
    form.append('file', file)
    if (content?.trim()) form.append('content', content.trim())
    return request<Message>(`/api/v1/rooms/${roomId}/files`, {
      method: 'POST',
      body: form,
    })
  },
  async downloadFile(fileId: string): Promise<Blob> {
    return fetchBlob(`/api/v1/files/${fileId}`)
  },
  async fetchBlob(path: string): Promise<Blob> {
    return fetchBlob(path)
  },
  pushPublicKey() {
    return request<{ publicKey: string }>('/api/v1/push/public-key')
  },
  pushSubscribe(subscription: { endpoint: string; p256dh: string; auth: string }) {
    return request<{ id: string; endpoint: string; createdAt: string }>('/api/v1/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
    })
  },
  pushUnsubscribe(endpoint: string) {
    return request<void>('/api/v1/push/unsubscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    })
  },
}

export function wsUrl(): string {
  const base = apiBase().replace(/^http/, 'ws')
  return `${base}/ws?token=${encodeURIComponent(token ?? '')}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function formatDay(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return 'Hoje'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function userAvatarPath(userId: string): string {
  return `/api/v1/users/${userId}/avatar`
}

export function roomAvatarPath(roomId: string): string {
  return `/api/v1/rooms/${roomId}/avatar`
}

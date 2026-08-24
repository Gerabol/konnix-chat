export type ServerInfo = {
  product: string
  version?: string
  serverName?: string
}

export type DesktopServer = {
  id: string
  url: string
  name: string
  info?: ServerInfo
  lastUsed: boolean
}

const STORAGE_KEY = 'konnix.desktop.servers.v1'
const ACTIVE_KEY = 'konnix.desktop.active-server.v1'

export function normalizeServerUrl(value: string): string {
  const input = value.trim()
  if (!input) throw new Error('Informe a URL do servidor.')
  let parsed: URL
  try { parsed = new URL(input) } catch { throw new Error('Informe uma URL válida.') }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Use uma URL http:// ou https://.')
  if (!parsed.hostname) throw new Error('Informe uma URL válida.')
  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  return parsed.toString().replace(/\/$/, '')
}

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch { return fallback }
}

function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getDesktopServers(): DesktopServer[] {
  return read<DesktopServer[]>(STORAGE_KEY, []).filter((server) => server?.id && server?.url)
}

export function getActiveServerId(): string | null {
  return read<string | null>(ACTIVE_KEY, null)
}

export function saveDesktopServers(servers: DesktopServer[]): void {
  write(STORAGE_KEY, servers)
}

export function setActiveServerId(id: string | null): void {
  write(ACTIVE_KEY, id)
}

export function serverIdForUrl(url: string): string {
  return btoa(url).replace(/[^a-z0-9]/gi, '').slice(0, 32) || url
}

export function serverLabel(url: string, info?: ServerInfo): string {
  return info?.serverName?.trim() || new URL(url).hostname
}

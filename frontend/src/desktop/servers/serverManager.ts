import { getActiveServerId, getDesktopServers, normalizeServerUrl, saveDesktopServers, serverIdForUrl, serverLabel, setActiveServerId } from './serverStore'
import type { DesktopServer, ServerInfo } from './serverStore'

export async function validateKonnixServer(value: string): Promise<{ url: string; info: ServerInfo }> {
  const url = normalizeServerUrl(value)
  const response = await fetch(`${url}/api/public/server-info`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('Não foi possível conectar a este servidor Konnix. Verifique a URL e tente novamente.')
  const body = await response.json() as { product?: string; version?: string; serverName?: string; data?: ServerInfo }
  const info: ServerInfo = body.data ?? { product: body.product ?? '', version: body.version, serverName: body.serverName }
  if (info.product !== 'Konnix Chat') throw new Error('O endereço informado não respondeu como um servidor Konnix Chat.')
  return { url, info: { product: info.product, version: info.version, serverName: info.serverName } }
}

export function activeDesktopServer(): DesktopServer | null {
  const servers = getDesktopServers()
  const id = getActiveServerId()
  return servers.find((server) => server.id === id) ?? servers[0] ?? null
}

export function persistServer(url: string, info: ServerInfo, existingId?: string): DesktopServer {
  const servers = getDesktopServers()
  const previous = existingId ? servers.find((entry) => entry.id === existingId) : undefined
  const id = previous?.url === url && existingId ? existingId : serverIdForUrl(url)
  const server: DesktopServer = { id, url, name: serverLabel(url, info), info, lastUsed: true }
  saveDesktopServers([...servers.filter((entry) => entry.id !== id && entry.id !== existingId && entry.url !== url), server].map((entry) => ({ ...entry, lastUsed: entry.id === id })))
  setActiveServerId(id)
  return server
}

export function activateDesktopServer(id: string): DesktopServer | null {
  const servers = getDesktopServers()
  const server = servers.find((entry) => entry.id === id) ?? null
  if (!server) return null
  setActiveServerId(id)
  saveDesktopServers(servers.map((entry) => ({ ...entry, lastUsed: entry.id === id })))
  return server
}

export function removeDesktopServer(id: string): void {
  const remaining = getDesktopServers().filter((server) => server.id !== id)
  saveDesktopServers(remaining)
  if (getActiveServerId() === id) setActiveServerId(remaining[0]?.id ?? null)
}

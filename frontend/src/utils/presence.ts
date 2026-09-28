import type { PresenceStatus } from '../api'

export const MANUAL_PRESENCE_KEY = 'konnix-manual-presence'

export const PRESENCE_OPTIONS: { id: PresenceStatus; label: string }[] = [
  { id: 'online', label: 'Conectado' },
  { id: 'away', label: 'Volto logo' },
  { id: 'busy', label: 'Ocupado' },
  { id: 'offline', label: 'Offline' },
  { id: 'mission', label: 'Em missão' },
  { id: 'vacation', label: 'Férias' },
]

export function presenceLabel(status: PresenceStatus): string {
  return PRESENCE_OPTIONS.find((option) => option.id === status)?.label ?? 'Offline'
}

export function readManualPresence(): PresenceStatus | null {
  try {
    const value = localStorage.getItem(MANUAL_PRESENCE_KEY)
    return value === 'offline' || value === 'away' || value === 'busy' || value === 'mission' || value === 'vacation'
      ? value
      : null
  } catch {
    return null
  }
}

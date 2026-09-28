import type { Room } from '../api'

export const ROOM_ICON: Record<string, string> = {
  CHANNEL: '#',
  PRIVATE_GROUP: '🔒',
  PUBLIC_GROUP: '🔒',
  DIRECT: '@',
}

export function getRoomIcon(room: Room): string {
  if (room.name === 'bug-reports') return '🐛'
  return ROOM_ICON[room.type] ?? ''
}

export function roomDisplayName(room: Room): string {
  if (room.type === 'DIRECT') {
    return (
      room.directPartner?.name ||
      room.directPartner?.username ||
      room.displayName ||
      room.name ||
      'Conversa'
    )
  }
  return room.displayName || room.name || 'Sem nome'
}

export function roomSubtitle(room: Room): string {
  if (room.type === 'DIRECT') {
    return room.directPartner
      ? `@${room.directPartner.username} | ${room.directPartner.email || 'sem e-mail'}`
      : 'Conversa'
  }
  if (room.type === 'CHANNEL') return 'Canal'
  return 'Grupo'
}

export function roomActivityTime(room: Room): number {
  return Date.parse(room.lastActivityAt ?? room.updatedAt ?? room.createdAt) || 0
}

import type { Room } from '../api.ts'

export type SidebarFilterMode = 'all' | 'unread' | 'mentions'

/**
 * Retorna se uma sala é considerada não lida:
 * possui mensagens novas não lidas (unreadCount > 0)
 * OU foi explicitamente marcada como não lida pelo usuário (markedUnread = true).
 */
export function isRoomUnread(room: Pick<Room, 'unreadCount' | 'markedUnread'>): boolean {
  return Boolean((room.unreadCount != null && room.unreadCount > 0) || room.markedUnread)
}

/**
 * Retorna se uma sala possui menções não lidas para o usuário atual.
 */
export function isRoomMentioned(room: Pick<Room, 'unreadMentionsCount'>): boolean {
  return Boolean(room.unreadMentionsCount != null && room.unreadMentionsCount > 0)
}

/**
 * Filtra uma lista de salas conforme o modo de filtro ativo ('all', 'unread' ou 'mentions').
 */
export function filterRoomsByMode<
  T extends Pick<Room, 'unreadCount' | 'markedUnread' | 'unreadMentionsCount'>
>(rooms: T[], filter: SidebarFilterMode): T[] {
  if (filter === 'unread') return rooms.filter(isRoomUnread)
  if (filter === 'mentions') return rooms.filter(isRoomMentioned)
  return rooms
}

/**
 * Alias mantido para compatibilidade.
 */
export const filterRoomsByUnread = filterRoomsByMode

/**
 * Calcula o total de salas não lidas únicas a partir de múltiplas coleções (canais, conversas, favoritos).
 */
export function countUniqueUnreadRooms(roomCollections: Array<Room[]>): number {
  const map = new Map<string, Room>()
  for (const list of roomCollections) {
    for (const room of list) {
      map.set(room.id, room)
    }
  }
  let count = 0
  for (const room of map.values()) {
    if (isRoomUnread(room)) {
      count++
    }
  }
  return count
}

/**
 * Calcula o total de salas únicas que possuem menções não lidas.
 */
export function countUniqueMentionedRooms(roomCollections: Array<Room[]>): number {
  const map = new Map<string, Room>()
  for (const list of roomCollections) {
    for (const room of list) {
      map.set(room.id, room)
    }
  }
  let count = 0
  for (const room of map.values()) {
    if (isRoomMentioned(room)) {
      count++
    }
  }
  return count
}

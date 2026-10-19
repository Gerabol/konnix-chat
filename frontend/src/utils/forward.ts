import { roomAvatarPath, userAvatarPath } from '../api.ts'
import type { DirectoryUser, Room } from '../api.ts'
import { getRoomIcon, initials, roomActivityTime, roomDisplayName } from './room.ts'

export type ForwardCandidate = {
  key: string
  name: string
  subtitle: string
  avatarPath: string | null
  iconType: 'channel' | 'group' | 'user'
  iconText: string
  targetRoomId?: string
  targetUserId?: string
}

export interface GetForwardCandidatesOptions {
  rooms: Room[]
  users: DirectoryUser[]
  currentUserId?: string
  avatarVersions?: Record<string, string>
  query?: string
  limit?: number
}

export function getForwardCandidates({
  rooms = [],
  users = [],
  currentUserId,
  avatarVersions,
  query = '',
  limit = 40,
}: GetForwardCandidatesOptions): ForwardCandidate[] {
  const normalizedQuery = query.trim().toLowerCase()

  // 1. Identificar usuários que já possuem sala direta ativa para evitar duplicidade
  const directPartnerUserIds = new Set<string>()
  for (const room of rooms) {
    if (room.type === 'DIRECT' && room.directPartner?.userId) {
      directPartnerUserIds.add(room.directPartner.userId)
    }
  }

  // 2. Ordenar salas por atividade mais recente (canais, grupos e conversas diretas ativas)
  const sortedRooms = [...rooms].sort((a, b) => roomActivityTime(b) - roomActivityTime(a))

  const roomCandidates: ForwardCandidate[] = []
  for (const room of sortedRooms) {
    if (room.type === 'DIRECT') {
      const partner = room.directPartner
      if (!partner) continue
      if (currentUserId && partner.userId === currentUserId) continue

      const name = partner.name || partner.username || roomDisplayName(room)
      const subtitle = `@${partner.username}`
      const searchHaystack = `${name} ${subtitle} ${partner.username}`.toLowerCase()

      if (normalizedQuery && !searchHaystack.includes(normalizedQuery)) {
        continue
      }

      const version = avatarVersions?.[partner.userId]
      const avatarPath = `${userAvatarPath(partner.userId)}${version ? `?v=${encodeURIComponent(version)}` : ''}`

      roomCandidates.push({
        key: `room-dm-${room.id}`,
        name,
        subtitle,
        avatarPath,
        iconType: 'user',
        iconText: initials(name),
        targetRoomId: room.id,
      })
    } else {
      const name = roomDisplayName(room)
      const subtitle = room.type === 'CHANNEL' ? 'Canal' : 'Grupo'
      const searchHaystack = `${name} ${room.name} ${subtitle}`.toLowerCase()

      if (normalizedQuery && !searchHaystack.includes(normalizedQuery)) {
        continue
      }

      const avatarPath = `${roomAvatarPath(room.id)}${room.updatedAt ? `?v=${encodeURIComponent(room.updatedAt)}` : ''}`

      roomCandidates.push({
        key: `room-${room.id}`,
        name,
        subtitle,
        avatarPath,
        iconType: room.type === 'CHANNEL' ? 'channel' : 'group',
        iconText: getRoomIcon(room),
        targetRoomId: room.id,
      })
    }
  }

  // 3. Usuários do diretório que ainda não possuem conversa direta ativa
  const userCandidates: ForwardCandidate[] = []
  for (const user of users) {
    if (currentUserId && user.id === currentUserId) continue
    if (directPartnerUserIds.has(user.id)) continue
    if (user.active === false || user.accountStatus === 'DISABLED') continue

    const name = user.name || user.username
    const subtitle = `@${user.username}`
    const searchHaystack = `${name} ${subtitle} ${user.username}`.toLowerCase()

    if (normalizedQuery && !searchHaystack.includes(normalizedQuery)) {
      continue
    }

    const version = avatarVersions?.[user.id]
    const avatarPath = `${userAvatarPath(user.id)}${version ? `?v=${encodeURIComponent(version)}` : ''}`

    userCandidates.push({
      key: `user-${user.id}`,
      name,
      subtitle,
      avatarPath,
      iconType: 'user',
      iconText: initials(name),
      targetUserId: user.id,
    })
  }

  return [...roomCandidates, ...userCandidates].slice(0, limit)
}

import type { RoomMember } from '../api'

export function filterMentionMembers(members: RoomMember[], currentUserId: string, query: string): RoomMember[] {
  const normalizedQuery = query.toLowerCase()
  return members.filter((member) =>
    member.active && member.accountStatus !== 'DISABLED' && member.userId !== currentUserId &&
    `${member.username} ${member.name}`.toLowerCase().includes(normalizedQuery),
  )
}

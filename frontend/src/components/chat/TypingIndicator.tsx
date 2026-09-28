import type { TypingUser } from '../../types'

export function TypingDots() {
  return (
    <span className="typing-dots" aria-hidden="true">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </span>
  )
}

export function formatTypingText(typingMap: Record<string, TypingUser> | undefined, isDirect: boolean): string | null {
  if (!typingMap) return null
  const users = Object.values(typingMap)
  if (users.length === 0) return null
  if (isDirect) return 'digitando...'
  if (users.length === 1) return `${users[0].name || users[0].username} está digitando...`
  if (users.length === 2) return `${users[0].name || users[0].username} e ${users[1].name || users[1].username} estão digitando...`
  return `${users[0].name || users[0].username} e outros estão digitando...`
}

export function formatRecordingTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

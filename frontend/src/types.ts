import type { PresenceStatus, User } from './api'

export type Session = {
  token: string
  user: User
}

export type DmPartner = {
  userId: string
  username: string
  name: string
  presenceStatus?: PresenceStatus
}

export type EmojiSelection = {
  native?: string
}

export type TypingUser = {
  userId: string
  username: string
  name: string
  timestamp: number
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DRAFTS_KEY = 'konnix-room-drafts'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_TRACKED_DRAFTS = 40

type StoredDraft = { text: string; savedAt: number }
type DraftStore = Record<string, StoredDraft>

function draftKey(userId: string, roomId: string): string {
  return `${userId}::${roomId}`
}

function readStore(): DraftStore {
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const store: DraftStore = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const { text, savedAt } = value as Partial<StoredDraft>
      if (typeof text !== 'string' || typeof savedAt !== 'number') continue
      store[key] = { text, savedAt }
    }
    return store
  } catch {
    return {}
  }
}

function writeStore(store: DraftStore): void {
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(store))
  } catch {
    /* armazenamento indisponível ou cota excedida */
  }
}

function pruneStore(store: DraftStore, now: number): DraftStore {
  const entries = Object.entries(store)
    .filter(([, draft]) => now - draft.savedAt < DRAFT_TTL_MS)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, MAX_TRACKED_DRAFTS)
  return Object.fromEntries(entries)
}

export function readRoomDraft(userId: string, roomId: string, now: number = Date.now()): string {
  const draft = readStore()[draftKey(userId, roomId)]
  if (!draft || now - draft.savedAt >= DRAFT_TTL_MS) return ''
  return draft.text
}

export function saveRoomDraft(userId: string, roomId: string, text: string, now: number = Date.now()): void {
  const store = readStore()
  const key = draftKey(userId, roomId)
  if (!text.trim()) {
    if (!(key in store)) return
    delete store[key]
  } else {
    store[key] = { text, savedAt: now }
  }
  writeStore(pruneStore(store, now))
}

export function clearRoomDraft(userId: string, roomId: string): void {
  saveRoomDraft(userId, roomId, '')
}

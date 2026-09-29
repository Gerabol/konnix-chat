const DRAFTS_DB_NAME = 'konnix-drafts'
const DRAFTS_STORE = 'drafts'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_TRACKED_DRAFTS = 40

export interface RoomDraft {
  text: string
  attachments: File[]
}

type StoredDraft = { key: string; text: string; savedAt: number; attachments: File[] }

function draftKey(userId: string, roomId: string): string {
  return `${userId}::${roomId}`
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<StoredDraft>
  return (
    typeof draft.key === 'string' &&
    typeof draft.text === 'string' &&
    typeof draft.savedAt === 'number' &&
    Array.isArray(draft.attachments)
  )
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DRAFTS_DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAFTS_STORE)) {
        request.result.createObjectStore(DRAFTS_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readAllDrafts(): Promise<StoredDraft[]> {
  return new Promise((resolve) => {
    openDatabase().then(
      (db) => {
        const tx = db.transaction(DRAFTS_STORE, 'readonly')
        const request = tx.objectStore(DRAFTS_STORE).getAll()
        request.onsuccess = () => {
          const rows = Array.isArray(request.result) ? request.result.filter(isStoredDraft) : []
          db.close()
          resolve(rows)
        }
        request.onerror = () => {
          db.close()
          resolve([])
        }
      },
      () => resolve([]),
    )
  })
}

function pruneDrafts(entries: StoredDraft[], now: number): StoredDraft[] {
  return entries
    .filter((entry) => now - entry.savedAt < DRAFT_TTL_MS)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_TRACKED_DRAFTS)
}

/**
 * Sincroniza o store com `entries`, substituindo ou removendo a chave editada.
 * O rascunho corrente entra na poda junto com os demais, evitando ultrapassar o teto.
 */
function writeDrafts(entries: StoredDraft[], current: StoredDraft | null, editedKey: string, now: number): Promise<void> {
  return new Promise((resolve, reject) => {
    openDatabase().then(
      (db) => {
        const tx = db.transaction(DRAFTS_STORE, 'readwrite')
        const store = tx.objectStore(DRAFTS_STORE)
        const others = entries.filter((entry) => entry.key !== editedKey)
        const kept = pruneDrafts(current ? [...others, current] : others, now)
        const keptKeys = new Set(kept.map((entry) => entry.key))
        for (const entry of entries) {
          if (!keptKeys.has(entry.key)) store.delete(entry.key)
        }
        for (const entry of kept) store.put(entry)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
        tx.onabort = () => {
          db.close()
          reject(tx.error)
        }
      },
      reject,
    )
  })
}

export async function readRoomDraft(
  userId: string,
  roomId: string,
  now: number = Date.now(),
): Promise<RoomDraft> {
  const entries = await readAllDrafts()
  const draft = entries.find((entry) => entry.key === draftKey(userId, roomId))
  if (!draft || now - draft.savedAt >= DRAFT_TTL_MS) return { text: '', attachments: [] }
  return { text: draft.text, attachments: draft.attachments }
}

export async function saveRoomDraft(
  userId: string,
  roomId: string,
  text: string,
  attachments: File[] = [],
  now: number = Date.now(),
): Promise<void> {
  const key = draftKey(userId, roomId)
  const files = Array.isArray(attachments) ? attachments : []
  const current = text.trim() || files.length > 0 ? { key, text, savedAt: now, attachments: files } : null
  try {
    await writeDrafts(await readAllDrafts(), current, key, now)
  } catch {
    /* indisponível ou cota excedida: mantém o rascunho apenas em memória */
  }
}

export async function clearRoomDraft(userId: string, roomId: string): Promise<void> {
  await saveRoomDraft(userId, roomId, '', [])
}

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { clearRoomDraft, readRoomDraft, saveRoomDraft } from './drafts.ts'

const DRAFTS_KEY = 'konnix-room-drafts'
const DAY_MS = 24 * 60 * 60 * 1000

describe('room drafts', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    const storage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        mockStorage = {}
      },
      key: () => null,
      length: 0,
    } as unknown as Storage
    ;(globalThis as unknown as { window: unknown }).window = { localStorage: storage }
  })

  it('returns an empty string for a room without draft', () => {
    assert.strictEqual(readRoomDraft('user-1', 'room-1'), '')
  })

  it('persists the draft per room and restores it when returning', () => {
    saveRoomDraft('user-1', 'room-1', 'mensagem pela metade')
    assert.strictEqual(readRoomDraft('user-1', 'room-1'), 'mensagem pela metade')
    assert.strictEqual(readRoomDraft('user-1', 'room-2'), '')
  })

  it('keeps drafts of different rooms isolated', () => {
    saveRoomDraft('user-1', 'room-1', 'primeira conversa')
    saveRoomDraft('user-1', 'room-2', 'segunda conversa')
    assert.strictEqual(readRoomDraft('user-1', 'room-1'), 'primeira conversa')
    assert.strictEqual(readRoomDraft('user-1', 'room-2'), 'segunda conversa')
  })

  it('keeps drafts of different users isolated', () => {
    saveRoomDraft('user-1', 'room-1', 'rascunho do usuario 1')
    assert.strictEqual(readRoomDraft('user-2', 'room-1'), '')
    assert.strictEqual(readRoomDraft('user-1', 'room-1'), 'rascunho do usuario 1')
  })

  it('deletes the entry when the draft is emptied or cleared', () => {
    saveRoomDraft('user-1', 'room-1', 'texto')
    saveRoomDraft('user-1', 'room-1', '   ')
    assert.strictEqual(readRoomDraft('user-1', 'room-1'), '')

    saveRoomDraft('user-1', 'room-1', 'texto')
    clearRoomDraft('user-1', 'room-1')
    assert.strictEqual(readRoomDraft('user-1', 'room-1'), '')
    assert.deepStrictEqual(JSON.parse(mockStorage[DRAFTS_KEY]), {})
  })

  it('drops drafts older than the retention window', () => {
    saveRoomDraft('user-1', 'room-1', 'rascunho antigo', 1_000)
    assert.strictEqual(readRoomDraft('user-1', 'room-1', 1_000 + 8 * DAY_MS), '')
  })

  it('keeps drafts inside the retention window', () => {
    saveRoomDraft('user-1', 'room-1', 'rascunho recente', 1_000)
    assert.strictEqual(readRoomDraft('user-1', 'room-1', 1_000 + 3 * DAY_MS), 'rascunho recente')
  })

  it('prunes expired entries and caps the number of tracked drafts', () => {
    saveRoomDraft('user-1', 'room-antigo', 'expirado', 1_000)
    for (let index = 0; index < 45; index++) {
      saveRoomDraft('user-1', `room-${index}`, `rascunho ${index}`, 1_000 + 8 * DAY_MS + index)
    }
    assert.strictEqual(readRoomDraft('user-1', 'room-44', 1_000 + 9 * DAY_MS), 'rascunho 44')
    assert.strictEqual(readRoomDraft('user-1', 'room-0', 1_000 + 9 * DAY_MS), '')
    assert.strictEqual(readRoomDraft('user-1', 'room-antigo', 1_000 + 9 * DAY_MS), '')
    assert.strictEqual(Object.keys(JSON.parse(mockStorage[DRAFTS_KEY])).length, 40)
  })

  it('ignores corrupted payloads instead of throwing', () => {
    mockStorage[DRAFTS_KEY] = '{nao é json'
    assert.strictEqual(readRoomDraft('user-1', 'room-1'), '')
    saveRoomDraft('user-1', 'room-1', 'recuperado')
    assert.strictEqual(readRoomDraft('user-1', 'room-1'), 'recuperado')

    mockStorage[DRAFTS_KEY] = JSON.stringify([1, 2, 3])
    assert.strictEqual(readRoomDraft('user-1', 'room-1'), '')
  })
})

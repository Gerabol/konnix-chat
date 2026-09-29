import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { clearRoomDraft, readRoomDraft, saveRoomDraft } from './drafts.ts'

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_TRACKED_DRAFTS = 40

type Rows = Map<string, unknown>

function dispatch(handler: (() => void) | null): void {
  queueMicrotask(() => handler?.())
}

/**
 * Cria um IndexedDB em memória com o recorte usado por drafts.ts:
 * open/upgradeneeded, transação, getAll/put/delete e commit da transação.
 */
function createFakeIndexedDb() {
  const databases = new Map<string, Rows>()

  function makeRequest<T>(compute: () => T) {
    const request: {
      result: T
      error: unknown
      onsuccess: (() => void) | null
      onerror: (() => void) | null
    } = { result: undefined as T, error: null, onsuccess: null, onerror: null }
    dispatch(() => {
      request.result = compute()
      request.onsuccess?.()
    })
    return request
  }

  return {
    rows: (name: string): Rows => databases.get(name) ?? new Map(),

    open(name: string) {
      const request: {
        result: unknown
        error: unknown
        onupgradeneeded: (() => void) | null
        onsuccess: (() => void) | null
        onerror: (() => void) | null
      } = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null }

      dispatch(() => {
        const created = !databases.has(name)
        if (created) databases.set(name, new Map())
        const rows = databases.get(name) as Rows
        const makeTransaction = () => {
          const tx: {
            error: unknown
            oncomplete: (() => void) | null
            onerror: (() => void) | null
            onabort: (() => void) | null
            objectStore: () => unknown
          } = {
            error: null,
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore: () => ({
              getAll: () => makeRequest(() => [...rows.values()]),
              get: (key: string) => makeRequest(() => rows.get(key)),
              put: (entry: { key: string }) => {
                rows.set(entry.key, entry)
                return makeRequest(() => entry.key)
              },
              delete: (key: string) => {
                rows.delete(key)
                return makeRequest(() => undefined)
              },
            }),
          }
          dispatch(() => tx.oncomplete?.())
          return tx
        }

        request.result = {
          objectStoreNames: { contains: (store: string) => store === 'drafts' },
          createObjectStore: () => ({}),
          close: () => {},
          transaction: makeTransaction,
        }
        if (created) request.onupgradeneeded?.()
        request.onsuccess?.()
      })

      return request
    },
  }
}

function fakeWindow() {
  const indexedDB = createFakeIndexedDb()
  ;(globalThis as unknown as { window: unknown }).window = { indexedDB }
  return indexedDB
}

function file(name: string, content: string, type = 'application/octet-stream'): File {
  return new File([content], name, { type, lastModified: 1_700_000_000_000 })
}

function audio(name = 'gravacao.mp3'): File {
  return file(name, 'ID3fake-mp3-bytes', 'audio/mpeg')
}

describe('room drafts', () => {
  beforeEach(() => {
    fakeWindow()
  })

  it('returns an empty draft for a room without draft', async () => {
    assert.deepStrictEqual(await readRoomDraft('user-1', 'room-1'), { text: '', attachments: [] })
  })

  it('persists the draft per room and restores it when returning', async () => {
    await saveRoomDraft('user-1', 'room-1', 'mensagem pela metade')
    assert.deepStrictEqual(await readRoomDraft('user-1', 'room-1'), {
      text: 'mensagem pela metade',
      attachments: [],
    })
    assert.deepStrictEqual(await readRoomDraft('user-1', 'room-2'), { text: '', attachments: [] })
  })

  it('keeps drafts of different rooms isolated', async () => {
    await saveRoomDraft('user-1', 'room-1', 'primeira conversa')
    await saveRoomDraft('user-1', 'room-2', 'segunda conversa')
    assert.strictEqual((await readRoomDraft('user-1', 'room-1')).text, 'primeira conversa')
    assert.strictEqual((await readRoomDraft('user-1', 'room-2')).text, 'segunda conversa')
  })

  it('keeps drafts of different users isolated', async () => {
    await saveRoomDraft('user-1', 'room-1', 'rascunho do usuario 1')
    assert.strictEqual((await readRoomDraft('user-2', 'room-1')).text, '')
    assert.strictEqual((await readRoomDraft('user-1', 'room-1')).text, 'rascunho do usuario 1')
  })

  it('deletes the entry when the draft is emptied or cleared', async () => {
    await saveRoomDraft('user-1', 'room-1', 'texto')
    await saveRoomDraft('user-1', 'room-1', '   ')
    assert.deepStrictEqual(await readRoomDraft('user-1', 'room-1'), { text: '', attachments: [] })

    await saveRoomDraft('user-1', 'room-1', 'texto')
    await clearRoomDraft('user-1', 'room-1')
    assert.deepStrictEqual(await readRoomDraft('user-1', 'room-1'), { text: '', attachments: [] })
  })

  it('drops drafts older than the retention window', async () => {
    await saveRoomDraft('user-1', 'room-1', 'rascunho antigo', [], 1_000)
    assert.strictEqual((await readRoomDraft('user-1', 'room-1', 1_000 + DRAFT_TTL_MS)).text, '')
  })

  it('keeps drafts inside the retention window', async () => {
    await saveRoomDraft('user-1', 'room-1', 'rascunho recente', [], 1_000)
    assert.strictEqual((await readRoomDraft('user-1', 'room-1', 1_000 + 3 * 24 * 60 * 60 * 1000)).text, 'rascunho recente')
  })

  it('prunes expired entries and caps the number of tracked drafts', async () => {
    await saveRoomDraft('user-1', 'room-antigo', 'expirado', [], 1_000)
    for (let index = 0; index < 45; index++) {
      await saveRoomDraft('user-1', `room-${index}`, `rascunho ${index}`, [], 1_000 + DRAFT_TTL_MS + index)
    }
    const now = 1_000 + DRAFT_TTL_MS + 1_000
    assert.strictEqual((await readRoomDraft('user-1', 'room-44', now)).text, 'rascunho 44')
    assert.strictEqual((await readRoomDraft('user-1', 'room-0', now)).text, '')
    assert.strictEqual((await readRoomDraft('user-1', 'room-antigo', now)).text, '')
    assert.strictEqual(fakeRows().size, MAX_TRACKED_DRAFTS)
  })

  it('ignores corrupted payloads instead of throwing', async () => {
    const db = fakeWindow()
    db.rows('konnix-drafts').set('lixo', 'nao e rascunho')
    assert.deepStrictEqual(await readRoomDraft('user-1', 'room-1'), { text: '', attachments: [] })
    await saveRoomDraft('user-1', 'room-1', 'recuperado')
    assert.strictEqual((await readRoomDraft('user-1', 'room-1')).text, 'recuperado')
  })

  it('restores attachments without text', async () => {
    const anexo = file('contrato.pdf', 'bytes-do-pdf', 'application/pdf')
    await saveRoomDraft('user-1', 'room-1', '', [anexo])
    const restored = await readRoomDraft('user-1', 'room-1')
    assert.strictEqual(restored.text, '')
    assert.strictEqual(restored.attachments.length, 1)
    assert.strictEqual(restored.attachments[0].name, 'contrato.pdf')
    assert.strictEqual(await restored.attachments[0].text(), 'bytes-do-pdf')
  })

  it('restores text together with attachments', async () => {
    const imagem = file('print.png', 'png-bytes', 'image/png')
    await saveRoomDraft('user-1', 'room-1', 'olha isso', [imagem])
    const restored = await readRoomDraft('user-1', 'room-1')
    assert.strictEqual(restored.text, 'olha isso')
    assert.strictEqual(restored.attachments[0].name, 'print.png')
    assert.strictEqual(restored.attachments[0].type, 'image/png')
  })

  it('restores audio recordings with their content', async () => {
    await saveRoomDraft('user-1', 'room-1', '', [audio('gravacao-1.mp3')])
    const restored = await readRoomDraft('user-1', 'room-1')
    assert.strictEqual(restored.attachments[0].name, 'gravacao-1.mp3')
    assert.strictEqual(restored.attachments[0].type, 'audio/mpeg')
    assert.strictEqual(await restored.attachments[0].text(), 'ID3fake-mp3-bytes')
  })

  it('keeps several attachments in order and replaces them on the next save', async () => {
    await saveRoomDraft('user-1', 'room-1', '', [file('a.png', 'a'), file('b.pdf', 'b')])
    assert.deepStrictEqual(
      (await readRoomDraft('user-1', 'room-1')).attachments.map((item) => item.name),
      ['a.png', 'b.pdf'],
    )

    await saveRoomDraft('user-1', 'room-1', '', [file('c.mp3', 'c', 'audio/mpeg')])
    assert.deepStrictEqual(
      (await readRoomDraft('user-1', 'room-1')).attachments.map((item) => item.name),
      ['c.mp3'],
    )
  })

  it('keeps the draft while an attachment survives the text being cleared', async () => {
    await saveRoomDraft('user-1', 'room-1', 'texto', [audio()])
    await saveRoomDraft('user-1', 'room-1', '', [audio()])
    assert.strictEqual((await readRoomDraft('user-1', 'room-1')).attachments.length, 1)
  })

  it('removes the entry once the last attachment is discarded', async () => {
    await saveRoomDraft('user-1', 'room-1', '', [audio()])
    await saveRoomDraft('user-1', 'room-1', '', [])
    assert.deepStrictEqual(await readRoomDraft('user-1', 'room-1'), { text: '', attachments: [] })
    assert.strictEqual(fakeRows().size, 0)
  })

  it('keeps attachments isolated between rooms and users', async () => {
    await saveRoomDraft('user-1', 'room-1', '', [file('x.png', 'x')])
    await saveRoomDraft('user-1', 'room-2', '', [file('y.png', 'y')])
    await saveRoomDraft('user-2', 'room-1', '', [file('z.png', 'z')])
    assert.strictEqual((await readRoomDraft('user-1', 'room-1')).attachments[0].name, 'x.png')
    assert.strictEqual((await readRoomDraft('user-1', 'room-2')).attachments[0].name, 'y.png')
    assert.strictEqual((await readRoomDraft('user-2', 'room-1')).attachments[0].name, 'z.png')
  })

  it('falls back to an empty draft when IndexedDB is unavailable', async () => {
    ;(globalThis as unknown as { window: unknown }).window = {
      indexedDB: {
        open: () => {
          const request: { error: unknown; onerror: (() => void) | null } = { error: new Error('bloqueado'), onerror: null }
          dispatch(() => request.onerror?.())
          return request
        },
      },
    }
    assert.deepStrictEqual(await readRoomDraft('user-1', 'room-1'), { text: '', attachments: [] })
    await saveRoomDraft('user-1', 'room-1', 'sem storage', [audio()])
  })
})

function fakeRows(): Map<string, unknown> {
  return (globalThis as unknown as { window: { indexedDB: ReturnType<typeof createFakeIndexedDb> } }).window
    .indexedDB.rows('konnix-drafts')
}

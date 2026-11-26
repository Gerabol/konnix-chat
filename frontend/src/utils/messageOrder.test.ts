import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { Message } from '../api.ts'
import { groupMessagesByDay, sortMessagesChronologically, upsertMessage } from './messageOrder.ts'

function createFakeMessage(id: string, createdAt: string, content = 'teste'): Message {
  return {
    id,
    roomId: 'room-1',
    userId: 'user-1',
    username: 'user1',
    content,
    createdAt,
    reactions: [],
    readBy: [],
  } as unknown as Message
}

function fakeFormatDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
}

describe('messageOrder utils', () => {
  describe('sortMessagesChronologically', () => {
    it('ordena mensagens fora de ordem pelo timestamp createdAt', () => {
      const m1 = createFakeMessage('m1', '2026-05-10T10:00:00Z')
      const m2 = createFakeMessage('m2', '2026-05-10T11:00:00Z')
      const m3 = createFakeMessage('m3', '2026-05-09T09:00:00Z')

      const sorted = sortMessagesChronologically([m1, m2, m3])
      assert.deepEqual(sorted.map((m) => m.id), ['m3', 'm1', 'm2'])
    })

    it('desempata pelo id caso os timestamps sejam idênticos', () => {
      const m1 = createFakeMessage('b', '2026-05-10T10:00:00Z')
      const m2 = createFakeMessage('a', '2026-05-10T10:00:00Z')

      const sorted = sortMessagesChronologically([m1, m2])
      assert.deepEqual(sorted.map((m) => m.id), ['a', 'b'])
    })
  })

  describe('groupMessagesByDay', () => {
    it('agrupa mensagens do mesmo dia no mesmo divisor', () => {
      const m1 = createFakeMessage('m1', '2026-05-10T10:00:00Z')
      const m2 = createFakeMessage('m2', '2026-05-10T12:00:00Z')
      const m3 = createFakeMessage('m3', '2026-05-11T09:00:00Z')

      const groups = groupMessagesByDay([m1, m2, m3], fakeFormatDay)
      assert.equal(groups.length, 2)
      assert.equal(groups[0].day, '10/5/2026')
      assert.equal(groups[0].items.length, 2)
      assert.equal(groups[1].day, '11/5/2026')
      assert.equal(groups[1].items.length, 1)
    })

    it('reordena antes de agrupar para evitar separadores de dias duplicados se array estiver desordenado', () => {
      const mRecent1 = createFakeMessage('m1', '2026-05-12T10:00:00Z')
      const mOld = createFakeMessage('m2', '2026-05-10T10:00:00Z')
      const mRecent2 = createFakeMessage('m3', '2026-05-12T11:00:00Z')

      // Se não houvesse ordenação prévia, geraria: 12/5, 10/5, 12/5 (dias duplicados/misturados)
      const groups = groupMessagesByDay([mRecent1, mOld, mRecent2], fakeFormatDay)
      assert.equal(groups.length, 2)
      assert.equal(groups[0].day, '10/5/2026')
      assert.equal(groups[0].items.map((m) => m.id).join(','), 'm2')
      assert.equal(groups[1].day, '12/5/2026')
      assert.equal(groups[1].items.map((m) => m.id).join(','), 'm1,m3')
    })
  })

  describe('upsertMessage', () => {
    it('atualiza mensagem existente in-place sem duplicar', () => {
      const m1 = createFakeMessage('m1', '2026-05-10T10:00:00Z', 'antes')
      const m2 = createFakeMessage('m2', '2026-05-10T11:00:00Z')
      const updated = createFakeMessage('m1', '2026-05-10T10:00:00Z', 'depois')

      const result = upsertMessage([m1, m2], updated)
      assert.equal(result.length, 2)
      assert.equal(result[0].content, 'depois')
      assert.equal(result[1].id, 'm2')
    })

    it('insere nova mensagem mantendo ordem cronológica', () => {
      const m1 = createFakeMessage('m1', '2026-05-10T10:00:00Z')
      const m3 = createFakeMessage('m3', '2026-05-10T12:00:00Z')
      const m2 = createFakeMessage('m2', '2026-05-10T11:00:00Z')

      const result = upsertMessage([m1, m3], m2)
      assert.deepEqual(result.map((m) => m.id), ['m1', 'm2', 'm3'])
    })
  })
})

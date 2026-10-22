import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { ReadReceipt } from '../api'
import { formatReaderCount, readerDisplayName, sortReadersByDate } from './readReceipts.ts'

describe('readReceipts utils', () => {
  describe('formatReaderCount', () => {
    it('retorna mensagem padrão quando count é 0 ou negativo', () => {
      assert.equal(formatReaderCount(0), 'Ainda não lida por outra pessoa.')
      assert.equal(formatReaderCount(-1), 'Ainda não lida por outra pessoa.')
    })

    it('retorna singular para 1 pessoa', () => {
      assert.equal(formatReaderCount(1), 'Lida por 1 pessoa')
    })

    it('retorna plural para 2 ou mais pessoas', () => {
      assert.equal(formatReaderCount(2), 'Lida por 2 pessoas')
      assert.equal(formatReaderCount(15), 'Lida por 15 pessoas')
    })
  })

  describe('sortReadersByDate', () => {
    it('ordena leitores por timestamp crescente (mais antigos primeiro)', () => {
      const readers: ReadReceipt[] = [
        { userId: 'u3', username: 'carlos', name: 'Carlos', readAt: '2026-10-21T10:05:00Z' },
        { userId: 'u1', username: 'alice', name: 'Alice', readAt: '2026-10-21T10:01:00Z' },
        { userId: 'u2', username: 'bob', name: 'Bob', readAt: '2026-10-21T10:03:00Z' },
      ]

      const sorted = sortReadersByDate(readers)
      assert.equal(sorted[0].userId, 'u1')
      assert.equal(sorted[1].userId, 'u2')
      assert.equal(sorted[2].userId, 'u3')
    })

    it('não muta o array original', () => {
      const readers: ReadReceipt[] = [
        { userId: 'u2', username: 'bob', name: 'Bob', readAt: '2026-10-21T10:03:00Z' },
        { userId: 'u1', username: 'alice', name: 'Alice', readAt: '2026-10-21T10:01:00Z' },
      ]

      const sorted = sortReadersByDate(readers)
      assert.notEqual(sorted, readers)
      assert.equal(readers[0].userId, 'u2')
    })
  })

  describe('readerDisplayName', () => {
    it('usa o nome completo quando disponível', () => {
      const reader: ReadReceipt = {
        userId: 'u1',
        username: 'alice',
        name: 'Alice Santos',
        readAt: '2026-10-21T10:00:00Z',
      }
      assert.equal(readerDisplayName(reader), 'Alice Santos')
    })

    it('faz fallback para username quando o nome for vazio ou nulo', () => {
      const readerWithoutName: ReadReceipt = {
        userId: 'u2',
        username: 'bob123',
        name: '',
        readAt: '2026-10-21T10:00:00Z',
      }
      assert.equal(readerDisplayName(readerWithoutName), 'bob123')
    })
  })
})

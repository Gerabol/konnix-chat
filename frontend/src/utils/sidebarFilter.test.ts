import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  isRoomUnread,
  isRoomMentioned,
  filterRoomsByMode,
  filterRoomsByUnread,
  countUniqueUnreadRooms,
  countUniqueMentionedRooms,
} from './sidebarFilter.ts'
import type { Room } from '../api.ts'

function mockRoom(partial: Partial<Room> & { id: string }): Room {
  return {
    id: partial.id,
    name: partial.name || 'test-room',
    displayName: partial.displayName || 'Test Room',
    type: partial.type || 'CHANNEL',
    createdBy: null,
    readOnly: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    lastActivityAt: null,
    unreadCount: partial.unreadCount ?? 0,
    favorite: partial.favorite ?? false,
    directPartner: null,
    pinnedMessage: null,
    markedUnread: partial.markedUnread,
    unreadMentionsCount: partial.unreadMentionsCount ?? 0,
  }
}

describe('sidebarFilter', () => {
  describe('isRoomUnread', () => {
    it('returns false when unreadCount is 0 and markedUnread is false or undefined', () => {
      assert.strictEqual(isRoomUnread({ unreadCount: 0 }), false)
      assert.strictEqual(isRoomUnread({ unreadCount: 0, markedUnread: false }), false)
    })

    it('returns true when unreadCount is greater than 0', () => {
      assert.strictEqual(isRoomUnread({ unreadCount: 1 }), true)
      assert.strictEqual(isRoomUnread({ unreadCount: 5, markedUnread: false }), true)
    })

    it('returns true when markedUnread is true even if unreadCount is 0', () => {
      assert.strictEqual(isRoomUnread({ unreadCount: 0, markedUnread: true }), true)
    })

    it('returns true when both unreadCount > 0 and markedUnread is true', () => {
      assert.strictEqual(isRoomUnread({ unreadCount: 3, markedUnread: true }), true)
    })
  })

  describe('isRoomMentioned', () => {
    it('returns false when unreadMentionsCount is 0 or undefined', () => {
      assert.strictEqual(isRoomMentioned({ unreadMentionsCount: 0 }), false)
      assert.strictEqual(isRoomMentioned({ unreadMentionsCount: undefined }), false)
    })

    it('returns true when unreadMentionsCount is greater than 0', () => {
      assert.strictEqual(isRoomMentioned({ unreadMentionsCount: 1 }), true)
      assert.strictEqual(isRoomMentioned({ unreadMentionsCount: 5 }), true)
    })
  })

  describe('filterRoomsByMode', () => {
    const roomA = mockRoom({ id: '1', unreadCount: 0, markedUnread: false, unreadMentionsCount: 0 })
    const roomB = mockRoom({ id: '2', unreadCount: 2, markedUnread: false, unreadMentionsCount: 1 })
    const roomC = mockRoom({ id: '3', unreadCount: 0, markedUnread: true, unreadMentionsCount: 0 })
    const roomD = mockRoom({ id: '4', unreadCount: 0, unreadMentionsCount: 0 })
    const roomE = mockRoom({ id: '5', unreadCount: 3, markedUnread: false, unreadMentionsCount: 2 })

    const list = [roomA, roomB, roomC, roomD, roomE]

    it('returns all rooms when filter mode is "all"', () => {
      const result = filterRoomsByMode(list, 'all')
      assert.strictEqual(result.length, 5)
      assert.deepStrictEqual(result.map((r) => r.id), ['1', '2', '3', '4', '5'])
    })

    it('returns only unread or marked-unread rooms when filter mode is "unread"', () => {
      const result = filterRoomsByMode(list, 'unread')
      assert.strictEqual(result.length, 3)
      assert.deepStrictEqual(result.map((r) => r.id), ['2', '3', '5'])
    })

    it('returns only mentioned rooms when filter mode is "mentions"', () => {
      const result = filterRoomsByMode(list, 'mentions')
      assert.strictEqual(result.length, 2)
      assert.deepStrictEqual(result.map((r) => r.id), ['2', '5'])
    })

    it('returns empty array when no rooms match the filter', () => {
      const readOnlyList = [roomA, roomD]
      assert.strictEqual(filterRoomsByMode(readOnlyList, 'unread').length, 0)
      assert.strictEqual(filterRoomsByMode(readOnlyList, 'mentions').length, 0)
    })

    it('filterRoomsByUnread alias works identically to filterRoomsByMode', () => {
      assert.deepStrictEqual(filterRoomsByUnread(list, 'unread'), filterRoomsByMode(list, 'unread'))
    })
  })

  describe('countUniqueUnreadRooms', () => {
    it('counts unique unread rooms deduplicating across multiple collections', () => {
      const roomA = mockRoom({ id: '1', unreadCount: 2 }) // unread
      const roomB = mockRoom({ id: '2', unreadCount: 0, markedUnread: true }) // unread
      const roomC = mockRoom({ id: '3', unreadCount: 0 }) // read

      // roomA is in favorites AND in channels
      const favorites = [roomA]
      const channels = [roomA, roomC]
      const conversations = [roomB]

      const count = countUniqueUnreadRooms([favorites, channels, conversations])
      assert.strictEqual(count, 2)
    })

    it('returns 0 when all collections have zero unread rooms', () => {
      const roomA = mockRoom({ id: '1', unreadCount: 0 })
      const roomB = mockRoom({ id: '2', unreadCount: 0, markedUnread: false })

      const count = countUniqueUnreadRooms([[roomA], [roomB]])
      assert.strictEqual(count, 0)
    })
  })

  describe('countUniqueMentionedRooms', () => {
    it('counts unique mentioned rooms deduplicating across multiple collections', () => {
      const roomA = mockRoom({ id: '1', unreadMentionsCount: 2 }) // mentioned
      const roomB = mockRoom({ id: '2', unreadMentionsCount: 0 }) // not mentioned
      const roomC = mockRoom({ id: '3', unreadMentionsCount: 1 }) // mentioned

      // roomA is in favorites AND in channels
      const favorites = [roomA]
      const channels = [roomA, roomB]
      const conversations = [roomC]

      const count = countUniqueMentionedRooms([favorites, channels, conversations])
      assert.strictEqual(count, 2)
    })

    it('returns 0 when all collections have zero mentioned rooms', () => {
      const roomA = mockRoom({ id: '1', unreadMentionsCount: 0 })
      const roomB = mockRoom({ id: '2', unreadMentionsCount: undefined })

      const count = countUniqueMentionedRooms([[roomA], [roomB]])
      assert.strictEqual(count, 0)
    })
  })
})

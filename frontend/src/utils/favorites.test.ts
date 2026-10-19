import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { FavoriteMessage, Message } from '../api'

function filterFavorites(favorites: FavoriteMessage[], query: string): FavoriteMessage[] {
  const q = query.trim().toLowerCase()
  if (!q) return favorites
  return favorites.filter((fav) => {
    const content = fav.message.content?.toLowerCase() ?? ''
    const author = fav.message.username?.toLowerCase() ?? ''
    const room = fav.roomName?.toLowerCase() ?? ''
    const attachment = fav.message.attachment?.originalName?.toLowerCase() ?? ''
    const poll = fav.message.poll?.question?.toLowerCase() ?? ''
    return (
      content.includes(q) ||
      author.includes(q) ||
      room.includes(q) ||
      attachment.includes(q) ||
      poll.includes(q)
    )
  })
}

function formatRoomBadge(fav: FavoriteMessage): string {
  if (fav.roomType === 'DIRECT') return `@${fav.roomName}`
  if (fav.roomType === 'CHANNEL') return `#${fav.roomName}`
  return `🔒 ${fav.roomName}`
}

function createSampleFavorite(overrides?: Partial<FavoriteMessage>): FavoriteMessage {
  const baseMessage: Message = {
    id: 'msg-1',
    roomId: 'room-1',
    userId: 'user-1',
    username: 'alice',
    content: 'Relatório financeiro finalizado',
    createdAt: '2026-10-19T10:00:00Z',
    messageType: 'TEXT',
  }

  return {
    favoriteId: 'fav-1',
    userId: 'user-me',
    roomId: 'room-1',
    messageId: 'msg-1',
    favoritedAt: '2026-10-19T10:05:00Z',
    roomName: 'geral',
    roomType: 'CHANNEL',
    message: baseMessage,
    ...overrides,
  }
}

test('formatRoomBadge returns correct prefix per room type', () => {
  assert.equal(
    formatRoomBadge(createSampleFavorite({ roomName: 'anuncios', roomType: 'CHANNEL' })),
    '#anuncios',
  )
  assert.equal(
    formatRoomBadge(createSampleFavorite({ roomName: 'diretoria', roomType: 'PRIVATE_GROUP' })),
    '🔒 diretoria',
  )
  assert.equal(
    formatRoomBadge(createSampleFavorite({ roomName: 'bob', roomType: 'DIRECT' })),
    '@bob',
  )
})

test('filterFavorites filters by message content case-insensitively', () => {
  const f1 = createSampleFavorite({ favoriteId: '1', message: { id: 'm1', content: 'Orçamento 2026' } as Message })
  const f2 = createSampleFavorite({ favoriteId: '2', message: { id: 'm2', content: 'Reunião de alinhamento' } as Message })

  const results = filterFavorites([f1, f2], 'orçamento')
  assert.equal(results.length, 1)
  assert.equal(results[0].favoriteId, '1')
})

test('filterFavorites filters by author username', () => {
  const f1 = createSampleFavorite({ favoriteId: '1', message: { id: 'm1', username: 'carlos' } as Message })
  const f2 = createSampleFavorite({ favoriteId: '2', message: { id: 'm2', username: 'daniela' } as Message })

  const results = filterFavorites([f1, f2], 'daniela')
  assert.equal(results.length, 1)
  assert.equal(results[0].favoriteId, '2')
})

test('filterFavorites filters by room name', () => {
  const f1 = createSampleFavorite({ favoriteId: '1', roomName: 'projetos' })
  const f2 = createSampleFavorite({ favoriteId: '2', roomName: 'suporte' })

  const results = filterFavorites([f1, f2], 'suporte')
  assert.equal(results.length, 1)
  assert.equal(results[0].favoriteId, '2')
})

test('filterFavorites filters by attachment original name', () => {
  const f1 = createSampleFavorite({
    favoriteId: '1',
    message: {
      id: 'm1',
      attachment: { id: 'a1', originalName: 'manual_usuario.pdf' },
    } as unknown as Message,
  })
  const f2 = createSampleFavorite({ favoriteId: '2' })

  const results = filterFavorites([f1, f2], 'manual')
  assert.equal(results.length, 1)
  assert.equal(results[0].favoriteId, '1')
})

test('filterFavorites filters by poll question', () => {
  const f1 = createSampleFavorite({
    favoriteId: '1',
    message: {
      id: 'm1',
      poll: { id: 'p1', question: 'Qual o melhor horário para o plantão?' },
    } as unknown as Message,
  })
  const f2 = createSampleFavorite({ favoriteId: '2' })

  const results = filterFavorites([f1, f2], 'plantão')
  assert.equal(results.length, 1)
  assert.equal(results[0].favoriteId, '1')
})

test('filterFavorites returns all favorites when query is empty or whitespace', () => {
  const list = [createSampleFavorite({ favoriteId: '1' }), createSampleFavorite({ favoriteId: '2' })]
  assert.equal(filterFavorites(list, '').length, 2)
  assert.equal(filterFavorites(list, '   ').length, 2)
})

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { roomAvatarPath, userAvatarPath } from '../api.ts'
import type { DirectoryUser, Room } from '../api.ts'
import { getForwardCandidates } from './forward.ts'

function makeRoom(overrides: Partial<Room>): Room {
  return {
    id: 'room-1',
    name: 'geral',
    displayName: 'Geral',
    type: 'CHANNEL',
    createdBy: 'user-admin',
    readOnly: false,
    hidden: false,
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-02T12:00:00Z',
    lastActivityAt: '2026-01-02T12:00:00Z',
    unreadCount: 0,
    favorite: false,
    directPartner: null,
    pinnedMessage: null,
    ...overrides,
  }
}

function makeUser(overrides: Partial<DirectoryUser>): DirectoryUser {
  return {
    id: 'user-1',
    username: 'joao.silva',
    name: 'João Silva',
    email: 'joao@example.com',
    active: true,
    accountStatus: 'ACTIVE',
    ...overrides,
  }
}

describe('getForwardCandidates', () => {
  it('resolves channels with room avatar path and cache buster when updatedAt exists', () => {
    const channel = makeRoom({
      id: 'channel-1',
      name: 'avisos',
      displayName: 'Avisos da Empresa',
      type: 'CHANNEL',
      updatedAt: '2026-03-01T10:00:00Z',
    })

    const candidates = getForwardCandidates({
      rooms: [channel],
      users: [],
    })

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].key, 'room-channel-1')
    assert.equal(candidates[0].name, 'Avisos da Empresa')
    assert.equal(candidates[0].subtitle, 'Canal')
    assert.equal(candidates[0].avatarPath, `${roomAvatarPath('channel-1')}?v=2026-03-01T10%3A00%3A00Z`)
    assert.equal(candidates[0].iconType, 'channel')
    assert.equal(candidates[0].iconText, '#')
    assert.equal(candidates[0].targetRoomId, 'channel-1')
  })

  it('resolves groups with group icon and group avatar path', () => {
    const group = makeRoom({
      id: 'group-1',
      name: 'financeiro',
      displayName: 'Time Financeiro',
      type: 'PRIVATE_GROUP',
      updatedAt: '2026-03-02T15:30:00Z',
    })

    const candidates = getForwardCandidates({
      rooms: [group],
      users: [],
    })

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].key, 'room-group-1')
    assert.equal(candidates[0].name, 'Time Financeiro')
    assert.equal(candidates[0].subtitle, 'Grupo')
    assert.equal(candidates[0].avatarPath, `${roomAvatarPath('group-1')}?v=2026-03-02T15%3A30%3A00Z`)
    assert.equal(candidates[0].iconType, 'group')
    assert.equal(candidates[0].iconText, '🔒')
    assert.equal(candidates[0].targetRoomId, 'group-1')
  })

  it('resolves bug-reports room with 🐛 icon fallback', () => {
    const bugRoom = makeRoom({
      id: 'room-bugs',
      name: 'bug-reports',
      displayName: 'Relato de Bugs',
      type: 'CHANNEL',
    })

    const candidates = getForwardCandidates({
      rooms: [bugRoom],
      users: [],
    })

    assert.equal(candidates[0].iconText, '🐛')
  })

  it('resolves active direct conversations with partner user avatar and version', () => {
    const dmRoom = makeRoom({
      id: 'dm-100',
      type: 'DIRECT',
      directPartner: {
        userId: 'user-maria',
        username: 'maria.souza',
        name: 'Maria Souza',
        email: 'maria@example.com',
        accountStatus: 'ACTIVE',
        presenceStatus: 'online',
      },
    })

    const candidates = getForwardCandidates({
      rooms: [dmRoom],
      users: [],
      avatarVersions: {
        'user-maria': 'v123',
      },
    })

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].key, 'room-dm-dm-100')
    assert.equal(candidates[0].name, 'Maria Souza')
    assert.equal(candidates[0].subtitle, '@maria.souza')
    assert.equal(candidates[0].avatarPath, `${userAvatarPath('user-maria')}?v=v123`)
    assert.equal(candidates[0].iconType, 'user')
    assert.equal(candidates[0].iconText, 'MS')
    assert.equal(candidates[0].targetRoomId, 'dm-100')
  })

  it('excludes current user from direct conversations and directory users', () => {
    const currentUserId = 'user-me'
    const selfDm = makeRoom({
      id: 'dm-self',
      type: 'DIRECT',
      directPartner: {
        userId: currentUserId,
        username: 'eu',
        name: 'Eu Mesmo',
        email: 'eu@example.com',
        accountStatus: 'ACTIVE',
        presenceStatus: 'online',
      },
    })
    const meUser = makeUser({ id: currentUserId, username: 'eu' })
    const otherUser = makeUser({ id: 'user-other', username: 'outro', name: 'Outro Usuário' })

    const candidates = getForwardCandidates({
      rooms: [selfDm],
      users: [meUser, otherUser],
      currentUserId,
    })

    assert.equal(candidates.find((c) => c.targetUserId === currentUserId), undefined)
    assert.equal(candidates.find((c) => c.key === 'room-dm-dm-self'), undefined)
    assert.ok(candidates.find((c) => c.targetUserId === 'user-other'))
  })

  it('avoids duplicate entries for users who already have an active direct conversation in rooms', () => {
    const dmRoom = makeRoom({
      id: 'dm-existing',
      type: 'DIRECT',
      directPartner: {
        userId: 'user-partner',
        username: 'partner',
        name: 'Parceiro Existente',
        email: 'partner@example.com',
        accountStatus: 'ACTIVE',
        presenceStatus: 'online',
      },
    })
    const partnerUser = makeUser({
      id: 'user-partner',
      username: 'partner',
      name: 'Parceiro Existente',
    })
    const newUser = makeUser({
      id: 'user-new',
      username: 'novo',
      name: 'Novo Contato',
    })

    const candidates = getForwardCandidates({
      rooms: [dmRoom],
      users: [partnerUser, newUser],
    })

    // Deve conter a sala direta existente, o novo usuário, mas NÃO o usuário parceiro duplicado
    assert.equal(candidates.length, 2)
    assert.equal(candidates[0].key, 'room-dm-dm-existing')
    assert.equal(candidates[1].key, 'user-user-new')
  })

  it('filters candidates by search query across name, username, and subtitle', () => {
    const channel = makeRoom({ id: 'c1', name: 'marketing', displayName: 'Time Marketing' })
    const user = makeUser({ id: 'u1', username: 'carlos.dev', name: 'Carlos Tech' })
    const user2 = makeUser({ id: 'u2', username: 'ana.silva', name: 'Ana Silva' })

    const searchMarketing = getForwardCandidates({
      rooms: [channel],
      users: [user, user2],
      query: 'market',
    })
    assert.equal(searchMarketing.length, 1)
    assert.equal(searchMarketing[0].name, 'Time Marketing')

    const searchCarlos = getForwardCandidates({
      rooms: [channel],
      users: [user, user2],
      query: 'carlos',
    })
    assert.equal(searchCarlos.length, 1)
    assert.equal(searchCarlos[0].name, 'Carlos Tech')
  })

  it('excludes inactive or disabled users from directory list', () => {
    const active = makeUser({ id: 'u1', active: true, accountStatus: 'ACTIVE' })
    const inactive = makeUser({ id: 'u2', active: false, accountStatus: 'ACTIVE' })
    const disabled = makeUser({ id: 'u3', active: true, accountStatus: 'DISABLED' })

    const candidates = getForwardCandidates({
      rooms: [],
      users: [active, inactive, disabled],
    })

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].key, 'user-u1')
  })
})

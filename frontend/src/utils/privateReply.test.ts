import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  canReplyPrivate,
  buildPrivateReplyQuote,
  resolveQuotedOriginName,
} from './privateReply.ts'
import type { Message, Room } from '../api.ts'

describe('privateReply utils', () => {
  describe('canReplyPrivate', () => {
    it('retorna true para mensagem de outro membro em canal público', () => {
      assert.equal(canReplyPrivate('CHANNEL', false, true), true)
    })

    it('retorna true para mensagem de outro membro em grupo privado', () => {
      assert.equal(canReplyPrivate('PRIVATE_GROUP', false, true), true)
    })

    it('retorna false para conversa direta (DIRECT)', () => {
      assert.equal(canReplyPrivate('DIRECT', false, true), false)
    })

    it('retorna false para mensagem própria (isMine = true)', () => {
      assert.equal(canReplyPrivate('CHANNEL', true, true), false)
      assert.equal(canReplyPrivate('PRIVATE_GROUP', true, true), false)
    })

    it('retorna false quando a mensagem não tem autor identificado', () => {
      assert.equal(canReplyPrivate('CHANNEL', false, false), false)
    })
  })

  describe('buildPrivateReplyQuote', () => {
    it('anexa originRoomId e originRoomName prioritariamente pelo displayName', () => {
      const message = {
        id: 'msg-1',
        roomId: 'room-1',
        userId: 'user-2',
        username: 'matheus',
        content: 'Olá a todos no grupo',
        messageType: 'USER',
        parentMessageId: null,
        attachment: null,
        createdAt: '2026-10-21T10:00:00Z',
        updatedAt: '2026-10-21T10:00:00Z',
        editedAt: null,
        deletedAt: null,
        readBy: [],
        quotedMessage: null,
        reactions: [],
        forwardedFromUsername: null,
        poll: null,
        roles: [],
      } as Message

      const originRoom = {
        id: 'room-1',
        name: 'geral',
        displayName: 'Equipe de TI',
        type: 'PRIVATE_GROUP',
        readOnly: false,
        unreadCount: 0,
        muted: false,
      } as Room

      const result = buildPrivateReplyQuote(message, originRoom)
      assert.equal(result.id, 'msg-1')
      assert.equal(result.originRoomId, 'room-1')
      assert.equal(result.originRoomName, 'Equipe de TI')
    })

    it('usa o name como fallback quando displayName não estiver presente', () => {
      const message = {
        id: 'msg-2',
        roomId: 'room-2',
        username: 'sergio',
        content: 'Teste',
      } as Message

      const originRoom = {
        id: 'room-2',
        name: 'financeiro',
        displayName: '',
        type: 'CHANNEL',
      } as Room

      const result = buildPrivateReplyQuote(message, originRoom)
      assert.equal(result.originRoomName, 'financeiro')
    })
  })

  describe('resolveQuotedOriginName', () => {
    const rooms = [
      { id: 'room-1', name: 'geral', displayName: 'Geral TI', type: 'CHANNEL' },
      { id: 'room-2', name: 'projetos', displayName: '', type: 'PRIVATE_GROUP' },
    ] as Room[]

    it('retorna originRoomName quando já explicitamente definido', () => {
      const quoted = { originRoomName: 'Grupo Alpha', roomId: 'room-9' }
      assert.equal(resolveQuotedOriginName(quoted, 'room-dm', rooms), 'Grupo Alpha')
    })

    it('resolve pelo roomId e displayName na lista de salas quando originRoomName ausente', () => {
      const quoted = { roomId: 'room-1' }
      assert.equal(resolveQuotedOriginName(quoted, 'room-dm', rooms), 'Geral TI')
    })

    it('resolve pelo name na lista de salas quando displayName vazio', () => {
      const quoted = { roomId: 'room-2' }
      assert.equal(resolveQuotedOriginName(quoted, 'room-dm', rooms), 'projetos')
    })

    it('retorna null se a citação pertencer à mesma sala atual', () => {
      const quoted = { roomId: 'room-1' }
      assert.equal(resolveQuotedOriginName(quoted, 'room-1', rooms), null)
    })

    it('retorna null se o objeto quoted for nulo ou indefinido', () => {
      assert.equal(resolveQuotedOriginName(null, 'room-1', rooms), null)
      assert.equal(resolveQuotedOriginName(undefined, 'room-1', rooms), null)
    })
  })
})

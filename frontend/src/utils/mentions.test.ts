import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { RoomMember } from '../api.ts'
import { filterMentionMembers } from './mentions.ts'

describe('sugestões de menção', () => {
  const member = (id: string, name: string): RoomMember => ({
    id, userId: id, username: id, name, role: 'MEMBER', joinedAt: '', active: true, accountStatus: 'ACTIVE',
  })

  it('inclui todos os membros, mesmo depois dos oito primeiros e sem mensagens', () => {
    const members = [...Array.from({ length: 9 }, (_, i) => member(`user${i}`, `Usuário ${i}`)), member('alexandre', 'Alexandre')]
    assert.equal(filterMentionMembers(members, 'me', '').length, 10)
    assert.equal(filterMentionMembers(members, 'me', 'ALEX')[0].username, 'alexandre')
  })

  it('exclui o usuário atual e contas inativas ou desabilitadas', () => {
    const members = [member('me', 'Eu'), { ...member('inactive', 'Inativo'), active: false }, { ...member('disabled', 'Desabilitado'), accountStatus: 'DISABLED' as const }, member('alexandre', 'Alexandre')]
    assert.deepEqual(filterMentionMembers(members, 'me', '').map((item) => item.userId), ['alexandre'])
  })
})

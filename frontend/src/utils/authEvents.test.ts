import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { shouldDispatchUnauthorized } from './authEvents.ts'

describe('authEvents utils', () => {
  it('não deve disparar logout para /api/v1/auth/login com credenciais inválidas', () => {
    assert.equal(shouldDispatchUnauthorized('/api/v1/auth/login'), false)
    assert.equal(shouldDispatchUnauthorized('/api/v1/auth/login?redirect=/chat'), false)
  })

  it('não deve disparar logout para /api/v1/auth/logout', () => {
    assert.equal(shouldDispatchUnauthorized('/api/v1/auth/logout'), false)
  })

  it('não deve disparar logout para /api/v1/push/unsubscribe', () => {
    assert.equal(shouldDispatchUnauthorized('/api/v1/push/unsubscribe'), false)
  })

  it('não deve disparar logout para endpoints públicos /api/public/*', () => {
    assert.equal(shouldDispatchUnauthorized('/api/public/server-info'), false)
  })

  it('deve disparar logout para chamadas autenticadas que retornam 401', () => {
    assert.equal(shouldDispatchUnauthorized('/api/v1/auth/me'), true)
    assert.equal(shouldDispatchUnauthorized('/api/v1/rooms'), true)
    assert.equal(shouldDispatchUnauthorized('/api/v1/rooms/123/messages'), true)
    assert.equal(shouldDispatchUnauthorized('/api/v1/users/directory'), true)
  })

  it('retorna false para paths vazios ou nulos', () => {
    assert.equal(shouldDispatchUnauthorized(''), false)
    assert.equal(shouldDispatchUnauthorized(undefined), false)
  })
})

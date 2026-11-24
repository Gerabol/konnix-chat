import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { shouldAnchorSearch, shouldAnchorSidebar, sidebarScrollOffset } from './sidebarScroll.ts'

describe('rolagem da conversa selecionada', () => {
  it('ativa somente ao alternar entre Todos e Recentes no desktop', () => {
    assert.equal(shouldAnchorSidebar('all', 'recent', true), true)
    assert.equal(shouldAnchorSidebar('recent', 'all', true), true)
    assert.equal(shouldAnchorSidebar('all', 'recent', false), false)
    assert.equal(shouldAnchorSidebar('unread', 'all', true), false)
    assert.equal(shouldAnchorSidebar('recent', 'mentions', true), false)
  })

  it('localiza o resultado de busca em Todos e Recentes no desktop', () => {
    assert.equal(shouldAnchorSearch('all', true, true), true)
    assert.equal(shouldAnchorSearch('recent', true, true), true)
    assert.equal(shouldAnchorSearch('unread', true, true), false)
    assert.equal(shouldAnchorSearch('all', false, true), false)
    assert.equal(shouldAnchorSearch('recent', true, false), false)
  })
  it('não rola uma lista pequena ou um item já visível', () => {
    assert.equal(sidebarScrollOffset(300, 300, 0, 300, 310, 340), 0)
    assert.equal(sidebarScrollOffset(600, 300, 0, 300, 100, 140), 0)
  })

  it('move somente o necessário para mostrar itens acima ou abaixo', () => {
    assert.equal(sidebarScrollOffset(600, 300, 100, 400, 70, 90), -30)
    assert.equal(sidebarScrollOffset(600, 300, 100, 400, 390, 430), 30)
  })
})

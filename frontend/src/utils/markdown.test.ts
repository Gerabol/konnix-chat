import { describe, it } from 'node:test'
import assert from 'node:assert'
import { renderMessageContent } from './markdown'
import type { ReactElement } from 'react'

describe('renderMessageContent mentions', () => {
  it('highlights valid mentions when user is in validMentionUsernames set', () => {
    const validSet = new Set(['alice', 'bob'])
    const result = renderMessageContent('Olá @alice e @charlie', 'bob', validSet)
    
    // Result is array of React elements / fragments / strings
    assert.strictEqual(result.length, 4)
    // piece 0: "Olá "
    // piece 1: span with class message-mention (@alice)
    // piece 2: " e "
    // piece 3: Fragment (@charlie - not in validSet)
    
    const elem1 = result[1] as ReactElement
    assert.strictEqual(elem1.props.className, 'message-mention ')

    const elem3 = result[3] as ReactElement
    assert.strictEqual(elem3.props.children, '@charlie')
  })

  it('highlights self mention with message-mention-self when user matches currentUsername', () => {
    const validSet = new Set(['bob'])
    const result = renderMessageContent('Oi @bob', 'bob', validSet)
    const elem = result[1] as ReactElement
    assert.strictEqual(elem.props.className, 'message-mention message-mention-self')
  })

  it('does not highlight disabled or non-member users not in validSet', () => {
    const validSet = new Set(['activeuser'])
    const result = renderMessageContent('Aviso para @disabledUser e @activeUser', 'me', validSet)
    
    // @disabledUser should not be a mention span
    const disabledPiece = result[1] as ReactElement
    assert.strictEqual(disabledPiece.props.children, '@disabledUser')

    // @activeUser should be a mention span
    const activePiece = result[3] as ReactElement
    assert.strictEqual(activePiece.props.className, 'message-mention ')
  })
})

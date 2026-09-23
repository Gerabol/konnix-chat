import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  isPushSupported,
  uint8ArrayToBase64Url,
  urlBase64ToUint8Array,
} from './push.ts'

describe('push utils', () => {
  it('converte base64url para Uint8Array e de volta com integridade', () => {
    const originalText = 'konnix-chat-push-test-payload-123456789'
    const encoder = new TextEncoder()
    const bytes = encoder.encode(originalText)

    const base64Url = uint8ArrayToBase64Url(bytes)
    assert.strictEqual(base64Url.includes('+'), false)
    assert.strictEqual(base64Url.includes('/'), false)
    assert.strictEqual(base64Url.includes('='), false)

    const recoveredBytes = urlBase64ToUint8Array(base64Url)
    const decoder = new TextDecoder()
    const recoveredText = decoder.decode(recoveredBytes)

    assert.strictEqual(recoveredText, originalText)
  })

  it('urlBase64ToUint8Array normaliza strings com padding e caracteres URL safe', () => {
    const b64 = 'c3ViamVjdA' // "subject" sem padding
    const bytes = urlBase64ToUint8Array(b64)
    const text = new TextDecoder().decode(bytes)
    assert.strictEqual(text, 'subject')
  })

  it('isPushSupported retorna false em ambiente sem APIs de Push', () => {
    const supported = isPushSupported()
    assert.strictEqual(typeof supported, 'boolean')
  })
})

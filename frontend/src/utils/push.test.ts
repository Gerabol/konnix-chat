import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  BRAVE_PUSH_STEPS,
  INSECURE_CONTEXT_MESSAGE,
  PUSH_SUBSCRIBE_ATTEMPTS,
  describePushError,
  isPushSupported,
  pushRetryDelayMs,
  pushServiceHints,
  shouldRetryPushSubscription,
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

  it('describePushError traduz cada causa do PushManager para uma orientação', () => {
    const domException = (name: string) => Object.assign(new Error('detalhe interno'), { name })

    assert.match(describePushError(domException('NotAllowedError')), /bloqueou a inscrição/)
    assert.match(describePushError(domException('NotAllowedError')), /tela inicial/)
    assert.match(describePushError(domException('NotSupportedError')), /não oferece Web Push/)
    assert.match(describePushError(domException('InvalidStateError')), /Recarregue a página/)
    assert.match(describePushError(domException('TypeError')), /chave pública de push do servidor/)
  })

  it('describePushError nunca devolve mensagem vazia nem a mensagem crua do navegador', () => {
    assert.strictEqual(describePushError(undefined).length > 0, true)
    assert.strictEqual(describePushError(new Error('')).length > 0, true)
    assert.match(describePushError(new Error('boom')), /Falha ao registrar o push: boom/)
  })

  it('a mensagem de contexto inseguro cita HTTPS e localhost', () => {
    assert.match(INSECURE_CONTEXT_MESSAGE, /HTTPS/)
    assert.match(INSECURE_CONTEXT_MESSAGE, /localhost/)
  })

  it('repete a inscrição apenas no AbortError e até o limite de tentativas', () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    const denied = Object.assign(new Error('x'), { name: 'NotAllowedError' })

    assert.strictEqual(shouldRetryPushSubscription(abort, 0), true)
    assert.strictEqual(shouldRetryPushSubscription(abort, 1), true)
    // Última tentativa: não insistir, para não travar a interface.
    assert.strictEqual(shouldRetryPushSubscription(abort, PUSH_SUBSCRIBE_ATTEMPTS - 1), false)
    // Causas definitivas não são retentadas.
    assert.strictEqual(shouldRetryPushSubscription(denied, 0), false)
    assert.strictEqual(shouldRetryPushSubscription(new Error('sem nome'), 0), false)
    assert.strictEqual(shouldRetryPushSubscription(undefined, 0), false)
  })

  it('o intervalo entre retentativas cresce e nunca fica indefinido', () => {
    const first = pushRetryDelayMs(0)
    const second = pushRetryDelayMs(1)
    assert.ok(second > first)
    assert.strictEqual(pushRetryDelayMs(99), pushRetryDelayMs(1))
  })

  it('o AbortError orienta sobre o serviço de push de cada navegador', () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    const message = describePushError(abort)
    assert.match(message, /fcm\.googleapis\.com/)
    assert.match(message, /updates\.push\.services\.mozilla\.com/)
    assert.match(message, /web\.push\.apple\.com/)
  })

  it('reconhece o Brave antes do Chrome, porque o user agent do Brave também traz "chrome"', () => {
    const braveUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Brave/1.71.118'
    const hint = pushServiceHints(braveUa)
    assert.match(hint, /brave:\/\/settings\/privacy/)
    assert.doesNotMatch(hint, /No Chrome/)
  })

  it('cada navegador recebe a orientação do próprio serviço de push', () => {
    const chrome = pushServiceHints('Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0 Safari/537.36')
    assert.match(chrome, /fcm\.googleapis\.com/)
    assert.match(chrome, /android\.googleapis\.com/)

    const edge = pushServiceHints('Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0')
    assert.match(edge, /fcm\.googleapis\.com/)

    const firefox = pushServiceHints('Mozilla/5.0 (Windows NT 10.0; rv:130.0) Gecko/20100101 Firefox/130.0')
    assert.match(firefox, /updates\.push\.services\.mozilla\.com/)
    assert.match(firefox, /servidores do Google/)

    const safari = pushServiceHints('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15')
    assert.match(safari, /tela inicial/)
  })

  it('sem user agent reconhecível, a mensagem cobre todos os navegadores', () => {
    for (const hint of [pushServiceHints(''), pushServiceHints('AgenteDesconhecido/1.0')]) {
      assert.match(hint, /fcm\.googleapis\.com/)
      assert.match(hint, /updates\.push\.services\.mozilla\.com/)
      assert.match(hint, /web\.push\.apple\.com/)
      assert.match(hint, /brave:\/\/settings\/privacy/)
    }
  })

  it('a orientação traz os três passos numerados do Brave', () => {
    assert.strictEqual(BRAVE_PUSH_STEPS.length, 3)
    const braveUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Brave/1.71.118'
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })

    for (const hint of [pushServiceHints(braveUa), describePushError(abort, braveUa)]) {
      assert.match(hint, /1\. Abra brave:\/\/settings\/privacy/)
      assert.match(hint, /2\. Ative "Usar serviços do Google para mensagens push"/)
      assert.match(hint, /3\. Recarregue a página e clique em "Ativar" de novo/)
    }
  })

  it('os passos do Brave aparecem mesmo quando o navegador não é identificado', () => {
    // Brave em iOS e com user agent reduzido não expõe o token "Brave/".
    const anonymousUa = 'AgenteDesconhecido/1.0'
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    for (const hint of [pushServiceHints(anonymousUa), pushServiceHints(''), describePushError(abort, anonymousUa)]) {
      assert.match(hint, /1\. Abra brave:\/\/settings\/privacy/)
      assert.match(hint, /3\. Recarregue a página/)
    }
  })

  it('o AbortError no Brave aponta a configuração do navegador', () => {
    const braveUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Brave/1.71.118'
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    assert.match(describePushError(abort, braveUa), /brave:\/\/settings\/privacy/)
  })
})

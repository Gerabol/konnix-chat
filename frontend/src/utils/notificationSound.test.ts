import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  buildNotificationWavBytes,
  formatNotificationSnippet,
  playNotificationSound,
  resetNotificationSoundStateForTests,
} from './notificationSound.ts'

describe('notificationSound utils', () => {
  beforeEach(() => {
    resetNotificationSoundStateForTests()
  })

  it('gera buffer WAV PCM 16-bit válido com cabeçalho RIFF/WAVE', () => {
    const wav = buildNotificationWavBytes()
    assert.ok(wav.byteLength > 44)
    const header = String.fromCharCode(wav[0], wav[1], wav[2], wav[3])
    const format = String.fromCharCode(wav[8], wav[9], wav[10], wav[11])
    assert.equal(header, 'RIFF')
    assert.equal(format, 'WAVE')
  })

  it('desduplica chamadas simultâneas para o mesmo messageId (WebSocket + Web Push)', () => {
    let playCount = 0
    const origAudio = globalThis.Audio
    try {
      ;(globalThis as unknown as { Audio: unknown }).Audio = class {
        volume = 1
        play() {
          playCount += 1
          return Promise.resolve()
        }
      }

      assert.equal(playNotificationSound('msg-123'), true)
      assert.equal(playNotificationSound('msg-123'), false)
      assert.equal(playCount, 1)
    } finally {
      ;(globalThis as unknown as { Audio: unknown }).Audio = origAudio
    }
  })

  it('formata mensagem de áudio quando o backend preenche content com originalName', () => {
    const snippet = formatNotificationSnippet({
      content: 'gravacao-1727543550000.mp3',
      attachment: {
        id: 'att-1',
        originalName: 'gravacao-1727543550000.mp3',
        mimeType: 'audio/mpeg',
        size: 12000,
      },
      poll: null,
    })
    assert.equal(snippet, '🎤 Mensagem de áudio')
  })

  it('preserva legenda customizada enviada junto com áudio ou foto', () => {
    const audioWithCaption = formatNotificationSnippet({
      content: 'Ouça o resumo da reunião',
      attachment: {
        id: 'att-2',
        originalName: 'gravacao-1727543550000.mp3',
        mimeType: 'audio/mpeg',
        size: 12000,
      },
      poll: null,
    })
    assert.equal(audioWithCaption, '🎤 Ouça o resumo da reunião')

    const imageWithoutCaption = formatNotificationSnippet({
      content: 'captura.png',
      attachment: {
        id: 'att-3',
        originalName: 'captura.png',
        mimeType: 'image/png',
        size: 45000,
      },
      poll: null,
    })
    assert.equal(imageWithoutCaption, '📷 Enviou uma foto')
  })

  it('não reproduz som quando konnix-system-notifications está configurado como false no localStorage', () => {
    const origStorage = globalThis.localStorage
    try {
      ;(globalThis as unknown as { localStorage: Partial<Storage> }).localStorage = {
        getItem: (key: string) => (key === 'konnix-system-notifications' ? 'false' : null),
      }
      assert.equal(playNotificationSound('msg-999'), false)
    } finally {
      ;(globalThis as unknown as { localStorage: Storage }).localStorage = origStorage
    }
  })
})

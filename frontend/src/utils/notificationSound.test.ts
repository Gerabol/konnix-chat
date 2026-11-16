import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  buildNotificationWavBytes,
  formatNotificationSnippet,
  playNotificationSound,
  resetNotificationSoundStateForTests,
  shouldPlayMessageNotificationSound,
} from './notificationSound.ts'

describe('notificationSound utils', () => {
  beforeEach(() => {
    resetNotificationSoundStateForTests()
  })

  describe('shouldPlayMessageNotificationSound', () => {
    it('retorna false quando o usuário está na conversa ativa com a aba visível (contato direto)', () => {
      const result = shouldPlayMessageNotificationSound({
        roomId: 'room-1',
        activeRoomId: 'room-1',
        isTabVisible: true,
      })
      assert.equal(result, false)
    })

    it('retorna true quando o usuário está na conversa ativa mas em outra aba (aba oculta/segundo plano)', () => {
      const result = shouldPlayMessageNotificationSound({
        roomId: 'room-1',
        activeRoomId: 'room-1',
        isTabVisible: false,
      })
      assert.equal(result, true)
    })

    it('retorna true quando a mensagem pertence a uma sala diferente da ativa com aba visível', () => {
      const result = shouldPlayMessageNotificationSound({
        roomId: 'room-2',
        activeRoomId: 'room-1',
        isTabVisible: true,
      })
      assert.equal(result, true)
    })

    it('retorna true quando a mensagem pertence a uma sala diferente da ativa com aba em segundo plano', () => {
      const result = shouldPlayMessageNotificationSound({
        roomId: 'room-2',
        activeRoomId: 'room-1',
        isTabVisible: false,
      })
      assert.equal(result, true)
    })

    it('retorna false quando roomId for nulo ou indefinido', () => {
      assert.equal(
        shouldPlayMessageNotificationSound({
          roomId: null,
          activeRoomId: 'room-1',
          isTabVisible: false,
        }),
        false,
      )
      assert.equal(
        shouldPlayMessageNotificationSound({
          roomId: undefined,
          activeRoomId: 'room-1',
          isTabVisible: false,
        }),
        false,
      )
    })

    it('no desktop Tauri: retorna false quando a janela está focada na conversa ativa', () => {
      const result = shouldPlayMessageNotificationSound({
        roomId: 'room-1',
        activeRoomId: 'room-1',
        isTabVisible: true,
        isTauri: true,
        isWindowFocused: true,
      })
      assert.equal(result, false)
    })

    it('no desktop Tauri: retorna true quando a janela está em segundo plano/sem foco', () => {
      const result = shouldPlayMessageNotificationSound({
        roomId: 'room-1',
        activeRoomId: 'room-1',
        isTabVisible: true,
        isTauri: true,
        isWindowFocused: false,
      })
      assert.equal(result, true)
    })
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

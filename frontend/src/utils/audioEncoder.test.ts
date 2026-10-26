import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  AudioTooShortError,
  encodeAudioBufferToMp3,
  encodeAudioBufferToWav,
  processRecordedAudio,
} from './audioEncoder.ts'

function createMockAudioBuffer(durationSeconds: number, sampleRate = 44100): AudioBuffer {
  const length = Math.round(durationSeconds * sampleRate)
  const channelData = new Float32Array(length)
  // Gera uma onda senoidal simples para teste
  for (let i = 0; i < length; i++) {
    channelData[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.7
  }
  return {
    sampleRate,
    length,
    duration: durationSeconds,
    numberOfChannels: 1,
    getChannelData: () => channelData,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer
}

describe('audioEncoder utils', () => {
  it('encodeAudioBufferToMp3 codifica com sucesso gerando blob audio/mpeg', () => {
    const buffer = createMockAudioBuffer(1.0, 44100)
    const blob = encodeAudioBufferToMp3(buffer, 128)
    assert.equal(blob.type, 'audio/mpeg')
    assert.ok(blob.size > 0, 'O tamanho do MP3 deve ser maior que 0')
  })

  it('encodeAudioBufferToWav codifica com cabeçalho RIFF/WAVE válido e tamanho preciso', async () => {
    const buffer = createMockAudioBuffer(0.5, 44100)
    const blob = encodeAudioBufferToWav(buffer)
    assert.equal(blob.type, 'audio/wav')
    const expectedSize = 44 + buffer.length * 2
    assert.equal(blob.size, expectedSize)

    const arrayBuffer = await blob.arrayBuffer()
    const view = new DataView(arrayBuffer)
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))
    assert.equal(riff, 'RIFF')
    assert.equal(wave, 'WAVE')
  })

  it('processRecordedAudio lança AudioTooShortError para blob vazio', async () => {
    const emptyBlob = new Blob([], { type: 'audio/webm' })
    await assert.rejects(
      () => processRecordedAudio(emptyBlob, 0.5),
      (err: unknown) => err instanceof AudioTooShortError,
    )
  })

  it('processRecordedAudio rejeita áudios com duração inferior ao mínimo estipulado', async () => {
    const originalAudioContext = (globalThis as unknown as { AudioContext?: unknown }).AudioContext

    try {
      const mockShortBuffer = createMockAudioBuffer(0.2, 44100)
      ;(globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
        async decodeAudioData() {
          return mockShortBuffer
        }
        async close() {}
      }

      const dummyBlob = new Blob([new ArrayBuffer(100)], { type: 'audio/webm' })
      await assert.rejects(
        () => processRecordedAudio(dummyBlob, 0.5),
        (err: unknown) => {
          assert.ok(err instanceof AudioTooShortError)
          assert.match(err.message, /muito curto/i)
          return true
        },
      )
    } finally {
      if (originalAudioContext) {
        ;(globalThis as unknown as { AudioContext?: unknown }).AudioContext = originalAudioContext
      } else {
        delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext
      }
    }
  })

  it('processRecordedAudio processa e retorna arquivo MP3 com duração finita para áudios válidos', async () => {
    const originalAudioContext = (globalThis as unknown as { AudioContext?: unknown }).AudioContext

    try {
      const mockValidBuffer = createMockAudioBuffer(1.2, 44100)
      ;(globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
        async decodeAudioData() {
          return mockValidBuffer
        }
        async close() {}
      }

      const dummyBlob = new Blob([new ArrayBuffer(500)], { type: 'audio/webm' })
      const result = await processRecordedAudio(dummyBlob, 0.5)

      assert.ok(result.file instanceof File)
      assert.equal(result.file.type, 'audio/mpeg')
      assert.ok(result.file.size > 0)
      assert.equal(result.duration, 1.2)
      assert.ok(result.file.name.endsWith('.mp3'))
    } finally {
      if (originalAudioContext) {
        ;(globalThis as unknown as { AudioContext?: unknown }).AudioContext = originalAudioContext
      } else {
        delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext
      }
    }
  })
})

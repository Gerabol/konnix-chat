import { describe, it } from 'node:test'
import assert from 'node:assert'
import { decodeAudioTo16kHzMono } from './audioDecoder.ts'

describe('audioDecoder utils', () => {
  it('lança erro quando fetch falha ou retorna status não-ok', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = async () => ({
        ok: false,
        status: 404,
      } as unknown as Response)

      await assert.rejects(
        () => decodeAudioTo16kHzMono('http://localhost/not-found.mp3'),
        /Falha ao carregar o arquivo de áudio \(404\)/
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('lança erro se AudioContext não estiver disponível no ambiente', async () => {
    const originalFetch = globalThis.fetch
    const originalAudioContext = (globalThis as unknown as { AudioContext?: unknown }).AudioContext
    try {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as unknown as Response)

      delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext

      await assert.rejects(
        () => decodeAudioTo16kHzMono('http://localhost/audio.mp3'),
        /Navegador não suporta AudioContext/
      )
    } finally {
      globalThis.fetch = originalFetch
      if (originalAudioContext) {
        ;(globalThis as unknown as { AudioContext?: unknown }).AudioContext = originalAudioContext
      }
    }
  })

  it('decodifica e resamplineia com sucesso quando AudioContext mockado está presente', async () => {
    const originalFetch = globalThis.fetch
    const originalAudioContext = (globalThis as unknown as { AudioContext?: unknown }).AudioContext

    try {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(16),
      } as unknown as Response)

      // Mock de AudioBuffer e AudioContext
      const mockAudioBuffer = {
        sampleRate: 44100,
        duration: 1.0,
        numberOfChannels: 1,
        length: 44100,
        getChannelData: () => new Float32Array(44100).fill(0.5),
      }

      ;(globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
        async decodeAudioData() {
          return mockAudioBuffer
        }
        async close() {}
      }

      const pcm = await decodeAudioTo16kHzMono('http://localhost/test.mp3')
      assert.strictEqual(pcm instanceof Float32Array, true)
      assert.strictEqual(pcm.length, 16000)
      // Checa se o valor interpolado manteve o sinal constante 0.5
      assert.strictEqual(Math.round(pcm[0] * 10) / 10, 0.5)
    } finally {
      globalThis.fetch = originalFetch
      if (originalAudioContext) {
        ;(globalThis as unknown as { AudioContext?: unknown }).AudioContext = originalAudioContext
      } else {
        delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext
      }
    }
  })
})

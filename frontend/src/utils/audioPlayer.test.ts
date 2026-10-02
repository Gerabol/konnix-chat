import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cyclePlaybackRate, formatAudioTime, PLAYBACK_RATES } from './audioPlayer.ts'

describe('audioPlayer utils', () => {
  describe('formatAudioTime', () => {
    it('formata 0 segundos corretamente', () => {
      assert.equal(formatAudioTime(0), '0:00')
    })

    it('formata segundos com preenchimento de zero à esquerda', () => {
      assert.equal(formatAudioTime(5), '0:05')
      assert.equal(formatAudioTime(9), '0:09')
      assert.equal(formatAudioTime(10), '0:10')
      assert.equal(formatAudioTime(59), '0:59')
    })

    it('formata minutos e segundos corretamente', () => {
      assert.equal(formatAudioTime(60), '1:00')
      assert.equal(formatAudioTime(75), '1:15')
      assert.equal(formatAudioTime(184), '3:04')
      assert.equal(formatAudioTime(612), '10:12')
    })

    it('trata valores decimais arredondando para baixo (floor)', () => {
      assert.equal(formatAudioTime(12.8), '0:12')
      assert.equal(formatAudioTime(65.999), '1:05')
    })

    it('retorna 0:00 para valores inválidos, negativos, NaN ou Infinity', () => {
      assert.equal(formatAudioTime(-1), '0:00')
      assert.equal(formatAudioTime(NaN), '0:00')
      assert.equal(formatAudioTime(Infinity), '0:00')
      assert.equal(formatAudioTime(-Infinity), '0:00')
    })
  })

  describe('cyclePlaybackRate', () => {
    it('cicla de 1x para 1.5x', () => {
      assert.equal(cyclePlaybackRate(1), 1.5)
    })

    it('cicla de 1.5x para 2x', () => {
      assert.equal(cyclePlaybackRate(1.5), 2)
    })

    it('cicla de 2x de volta para 1x', () => {
      assert.equal(cyclePlaybackRate(2), 1)
    })

    it('retorna 1x para qualquer valor inesperado', () => {
      assert.equal(cyclePlaybackRate(0.5), 1)
      assert.equal(cyclePlaybackRate(3), 1)
    })

    it('mantém a lista de velocidades suportadas como [1, 1.5, 2]', () => {
      assert.deepEqual(PLAYBACK_RATES, [1, 1.5, 2])
    })
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isAudioAttachment } from './attachmentKind.ts'

describe('isAudioAttachment', () => {
  it('não classifica vídeos MP4 como áudio', () => {
    assert.equal(isAudioAttachment({ mimeType: 'video/mp4', originalName: 'apresentacao.mp4' }), false)
    assert.equal(isAudioAttachment({ mimeType: '', originalName: 'apresentacao.mp4' }), false)
    assert.equal(
      isAudioAttachment({ mimeType: 'application/octet-stream', originalName: 'apresentacao.mp4' }),
      false,
    )
  })

  it('não classifica vídeos WebM como áudio', () => {
    assert.equal(isAudioAttachment({ mimeType: 'video/webm', originalName: 'gravacao-da-tela.webm' }), false)
    assert.equal(
      isAudioAttachment({ mimeType: 'video/webm;codecs=vp9', originalName: 'gravacao-da-tela.webm' }),
      false,
    )
    assert.equal(isAudioAttachment({ mimeType: '', originalName: 'gravacao-da-tela.webm' }), false)
  })

  it('continua classificando áudios como áudio', () => {
    assert.equal(isAudioAttachment({ mimeType: 'audio/webm', originalName: 'gravacao.webm' }), true)
    assert.equal(isAudioAttachment({ mimeType: 'audio/mpeg', originalName: 'gravacao.mp3' }), true)
    assert.equal(isAudioAttachment({ mimeType: 'audio/mp4', originalName: 'nota.m4a' }), true)
    assert.equal(
      isAudioAttachment({ mimeType: 'application/octet-stream', originalName: 'nota.m4a' }),
      true,
    )
    assert.equal(isAudioAttachment({ mimeType: '', originalName: 'nota.wav' }), true)
  })

  it('não classifica outros tipos como áudio', () => {
    assert.equal(isAudioAttachment({ mimeType: 'text/plain', originalName: 'relatorio.txt' }), false)
    assert.equal(isAudioAttachment({ mimeType: 'image/png', originalName: 'foto.png' }), false)
    assert.equal(isAudioAttachment({ mimeType: null, originalName: 'documento.pdf' }), false)
  })
})

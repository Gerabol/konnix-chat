/**
 * Utilitário para decodificar e reamostrar áudio para Float32Array em 16kHz Mono,
 * formato padrão exigido pelo Whisper (Transformers.js).
 */

export async function decodeAudioTo16kHzMono(audioUrl: string): Promise<Float32Array> {
  const response = await fetch(audioUrl)
  if (!response.ok) {
    throw new Error(`Falha ao carregar o arquivo de áudio (${response.status})`)
  }
  const arrayBuffer = await response.arrayBuffer()

  const globalScope = typeof window !== 'undefined' ? window : (globalThis as unknown as Window)
  const AudioContextClass =
    globalScope.AudioContext || (globalScope as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) {
    throw new Error('Navegador não suporta AudioContext para decodificação.')
  }

  const audioCtx = new AudioContextClass()
  let audioBuffer: AudioBuffer
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    try {
      await audioCtx.close()
    } catch {
      // Ignora erro ao fechar contexto temporário
    }
  }

  const targetSampleRate = 16000
  const duration = audioBuffer.duration
  const targetLength = Math.max(1, Math.round(duration * targetSampleRate))

  // Se o navegador suporta OfflineAudioContext, usamos para reamostragem perfeita e rápida
  const OfflineAudioContextClass =
    globalScope.OfflineAudioContext ||
    (globalScope as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext

  if (OfflineAudioContextClass) {
    const offlineCtx = new OfflineAudioContextClass(1, targetLength, targetSampleRate)
    const source = offlineCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(offlineCtx.destination)
    source.start(0)

    const renderedBuffer = await offlineCtx.startRendering()
    return renderedBuffer.getChannelData(0)
  }

  // Fallback: interpolação linear manual caso OfflineAudioContext não esteja disponível
  const channels = audioBuffer.numberOfChannels
  const srcLength = audioBuffer.length
  const monoData = new Float32Array(srcLength)

  if (channels === 1) {
    monoData.set(audioBuffer.getChannelData(0))
  } else {
    for (let c = 0; c < channels; c++) {
      const channelData = audioBuffer.getChannelData(c)
      for (let i = 0; i < srcLength; i++) {
        monoData[i] += channelData[i] / channels
      }
    }
  }

  if (audioBuffer.sampleRate === targetSampleRate) {
    return monoData
  }

  const resampled = new Float32Array(targetLength)
  const ratio = (srcLength - 1) / (targetLength - 1 || 1)
  for (let i = 0; i < targetLength; i++) {
    const srcIndex = i * ratio
    const indexLow = Math.floor(srcIndex)
    const indexHigh = Math.min(indexLow + 1, srcLength - 1)
    const fraction = srcIndex - indexLow
    resampled[i] = monoData[indexLow] * (1 - fraction) + monoData[indexHigh] * fraction
  }

  return resampled
}

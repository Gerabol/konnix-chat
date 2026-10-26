import { pipeline, env, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

// Configura Transformers.js para ambiente web seguro e ativa cache local no navegador
env.allowLocalModels = false
env.useBrowserCache = true

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null

async function getTranscriber(
  onProgress?: (progressData: { status: string; progress?: number; file?: string }) => void,
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      // whisper-small multilíngue: modelo de referência de alta acurácia para português
      const pipe = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-small', {
        dtype: {
          encoder_model: 'fp32',
          decoder_model_merged: 'q4',
        },
        progress_callback: (data: unknown) => {
          if (onProgress && typeof data === 'object' && data !== null) {
            const p = data as { status: string; progress?: number; file?: string }
            onProgress(p)
          }
        },
      })
      return pipe as AutomaticSpeechRecognitionPipeline
    })()
  }
  return transcriberPromise
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { id, type, audio, language = 'portuguese' } = event.data || {}

  if (type === 'transcribe') {
    try {
      // Notifica início do carregamento/modelo
      self.postMessage({ id, type: 'status', status: 'loading-model' })

      const transcriber = await getTranscriber((prog) => {
        if (prog.status === 'progress' && typeof prog.progress === 'number') {
          self.postMessage({
            id,
            type: 'download-progress',
            file: prog.file,
            progress: Math.round(prog.progress),
          })
        }
      })

      // Notifica início da inferência do Whisper
      self.postMessage({ id, type: 'status', status: 'transcribing' })

      const result = await transcriber(audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language,
        task: 'transcribe',
        initial_prompt: 'Transcrição de conversa de chat corporativo em português brasileiro, áudio claro com pontuação correta.',
        temperature: 0,
        repetition_penalty: 1.2,
      })

      const rawText = Array.isArray(result) ? result.map((r: { text?: string }) => r.text || '').join(' ') : (result?.text || '')
      const cleanedText = (rawText as string).trim()

      self.postMessage({
        id,
        type: 'complete',
        text: cleanedText,
      })
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      self.postMessage({
        id,
        type: 'error',
        error: errorMsg,
      })
    }
  }
})

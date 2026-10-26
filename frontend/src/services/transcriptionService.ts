import { decodeAudioTo16kHzMono } from '../utils/audioDecoder'

interface PendingTask {
  resolve: (text: string) => void
  reject: (err: Error) => void
  onStatusUpdate?: (statusText: string) => void
}

class TranscriptionService {
  private worker: Worker | null = null
  private tasks = new Map<string, PendingTask>()
  private cache = new Map<string, string>()

  private getOrCreateWorker(): Worker {
    if (!this.worker) {
      // Instanciação compatível com Vite para Web Workers com suporte a ES Modules
      this.worker = new Worker(
        new URL('../workers/transcriptionWorker.ts', import.meta.url),
        { type: 'module' }
      )

      this.worker.onmessage = (event: MessageEvent) => {
        const { id, type, text, error, status, progress } = event.data || {}
        const task = this.tasks.get(id)
        if (!task) return

        if (type === 'status') {
          if (status === 'loading-model') {
            task.onStatusUpdate?.('Carregando IA...')
          } else if (status === 'transcribing') {
            task.onStatusUpdate?.('Transcrevendo áudio com Whisper Small...')
          }
        } else if (type === 'download-progress') {
          task.onStatusUpdate?.(`Baixando Whisper Small (${progress}%)...`)
        } else if (type === 'complete') {
          task.resolve(text || '')
          this.tasks.delete(id)
        } else if (type === 'error') {
          task.reject(new Error(error || 'Falha na transcrição'))
          this.tasks.delete(id)
        }
      }

      this.worker.onerror = (err) => {
        console.error('[TranscriptionService] Erro no Worker:', err)
      }
    }
    return this.worker
  }

  public getCachedTranscription(audioUrl: string): string | undefined {
    return this.cache.get(audioUrl)
  }

  public async transcribeAudio(
    audioUrl: string,
    onStatusUpdate?: (statusText: string) => void
  ): Promise<string> {
    const cached = this.cache.get(audioUrl)
    if (cached !== undefined) {
      return cached
    }

    onStatusUpdate?.('Preparando áudio...')
    const audioData = await decodeAudioTo16kHzMono(audioUrl)

    const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const worker = this.getOrCreateWorker()

    return new Promise<string>((resolve, reject) => {
      this.tasks.set(taskId, {
        resolve: (text) => {
          this.cache.set(audioUrl, text)
          resolve(text)
        },
        reject,
        onStatusUpdate,
      })

      // Transfere o buffer do áudio para o Worker sem cópia de memória
      worker.postMessage(
        {
          id: taskId,
          type: 'transcribe',
          audio: audioData,
          language: 'portuguese',
        },
        [audioData.buffer]
      )
    })
  }
}

export const transcriptionService = new TranscriptionService()

export type AttachmentKindInfo = {
  mimeType?: string | null
  originalName: string
}

// Extensões exclusivas de áudio. Contêineres como .mp4 e .webm ficam de fora
// porque também podem carregar vídeo.
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|oga|m4a|aac|flac)$/i

/**
 * Só considera áudio quando o MIME declara `audio/` ou, na ausência de um MIME
 * confiável, quando a extensão é exclusivamente de áudio. Um vídeo MP4/WebM
 * nunca deve ser tratado como áudio.
 */
export function isAudioAttachment(attachment: AttachmentKindInfo): boolean {
  const mime = attachment.mimeType?.toLowerCase() ?? ''
  if (mime.startsWith('video/')) return false
  if (mime.startsWith('audio/')) return true
  return AUDIO_EXTENSIONS.test(attachment.originalName)
}

export function isAudioFile(file: Pick<File, 'name' | 'type'>): boolean {
  return isAudioAttachment({ mimeType: file.type, originalName: file.name })
}

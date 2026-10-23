import type { Attachment, Message, RoomFile } from '../api'

export type MediaType = 'image' | 'video'

export type MediaItem = {
  id: string
  originalName: string
  mimeType: string
  size: number
  createdAt?: string
  username?: string
  name?: string | null
  type: MediaType
}

const IMAGE_EXTENSIONS_REGEX = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i
const VIDEO_EXTENSIONS_REGEX = /\.(mp4|webm|mov|mkv|ogg|ogv)$/i

export function isImageMime(mimeType: string, filename?: string): boolean {
  if (mimeType && mimeType.startsWith('image/')) return true
  if (filename && IMAGE_EXTENSIONS_REGEX.test(filename)) return true
  return false
}

export function isVideoMime(mimeType: string, filename?: string): boolean {
  if (mimeType && mimeType.startsWith('video/')) return true
  if (filename && VIDEO_EXTENSIONS_REGEX.test(filename)) return true
  return false
}

export function isMediaAttachment(file: { mimeType?: string | null; originalName?: string | null }): boolean {
  const mime = file.mimeType || ''
  const name = file.originalName || ''
  return isImageMime(mime, name) || isVideoMime(mime, name)
}

export function getMediaType(mimeType: string, filename?: string): MediaType {
  if (isVideoMime(mimeType, filename)) return 'video'
  return 'image'
}

/**
 * Normaliza e consolida arquivos de mídia (imagens e vídeos) da sala,
 * ordenados cronologicamente (do mais antigo para o mais recente).
 */
export function extractRoomMedia(
  roomFiles: RoomFile[] = [],
  messages: Message[] = [],
): MediaItem[] {
  const itemsMap = new Map<string, MediaItem>()

  // 1. Processar arquivos retornados pela API de arquivos da sala
  for (const file of roomFiles) {
    if (!isMediaAttachment(file)) continue
    itemsMap.set(file.id, {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      createdAt: file.createdAt,
      username: file.username,
      name: file.name,
      type: getMediaType(file.mimeType, file.originalName),
    })
  }

  // 2. Complementar com mensagens da timeline (ex: mídias enviadas recentemente que ainda não estão no cache da sala)
  for (const msg of messages) {
    const list: Attachment[] = msg.attachments ?? (msg.attachment ? [msg.attachment] : [])
    for (const att of list) {
      if (!isMediaAttachment(att)) continue
      if (!itemsMap.has(att.id)) {
        itemsMap.set(att.id, {
          id: att.id,
          originalName: att.originalName,
          mimeType: att.mimeType,
          size: att.size,
          createdAt: msg.createdAt,
          username: msg.username,
          name: null,
          type: getMediaType(att.mimeType, att.originalName),
        })
      }
    }
  }

  const items = Array.from(itemsMap.values())

  // Ordenar cronologicamente do mais antigo para o mais recente
  return items.sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return timeA - timeB
  })
}

export function getNextMediaIndex(currentIndex: number, total: number): number {
  if (total <= 0) return 0
  return currentIndex < total - 1 ? currentIndex + 1 : currentIndex
}

export function getPrevMediaIndex(currentIndex: number): number {
  return currentIndex > 0 ? currentIndex - 1 : 0
}

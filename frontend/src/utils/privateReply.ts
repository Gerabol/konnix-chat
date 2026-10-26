import type { Message, Room } from '../api'

/**
 * Determina se a opção "Responder em particular" deve estar disponível para uma mensagem.
 *
 * Requisitos de negócio:
 * 1. A sala atual deve ser um canal ou grupo (não uma conversa direta).
 * 2. O usuário não pode responder em particular a si mesmo (!isMine).
 * 3. A mensagem precisa ter um autor identificado (hasAuthorId).
 */
export function canReplyPrivate(
  roomType: string | undefined,
  isMine: boolean,
  hasAuthorId: boolean,
): boolean {
  if (roomType === 'DIRECT') return false
  if (isMine) return false
  return hasAuthorId
}

/**
 * Cria a representação da mensagem a ser citada com metadados da sala de origem.
 */
export function buildPrivateReplyQuote(message: Message, originRoom: Room): Message {
  const originRoomName = originRoom.displayName || originRoom.name
  return {
    ...message,
    originRoomId: originRoom.id,
    originRoomName,
  }
}

/**
 * Resolve o nome de exibição da sala de origem para uma mensagem citada.
 * Retorna null quando a citação pertence à mesma sala ou a sala não puder ser resolvida.
 */
export function resolveQuotedOriginName(
  quoted: { originRoomName?: string | null; roomId?: string | null } | null | undefined,
  currentRoomId: string,
  rooms: Room[],
): string | null {
  if (!quoted) return null
  if (quoted.originRoomName && quoted.originRoomName.trim().length > 0) {
    return quoted.originRoomName.trim()
  }
  if (quoted.roomId && quoted.roomId !== currentRoomId) {
    const origin = rooms.find((r) => r.id === quoted.roomId)
    if (origin) {
      return (origin.displayName || origin.name || '').trim() || null
    }
  }
  return null
}

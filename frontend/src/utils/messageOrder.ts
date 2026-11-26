import type { Message } from '../api'

/**
 * Ordena mensagens cronologicamente (da mais antiga para a mais recente).
 * Em caso de timestamps idênticos, desempata pelo ID.
 */
export function sortMessagesChronologically(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt)
    if (diff !== 0) return diff
    return a.id.localeCompare(b.id)
  })
}

/**
 * Agrupa mensagens ordenadas por dia de forma segura e determinística.
 * Se houver mensagens fora de ordem, garante a ordenação prévia antes
 * do agrupamento para que separadores de dias nunca apareçam duplicados ou misturados.
 */
export function groupMessagesByDay(messages: Message[], formatDayFn: (iso: string) => string): { day: string; items: Message[] }[] {
  if (messages.length === 0) return []

  const sorted = sortMessagesChronologically(messages)
  const out: { day: string; items: Message[] }[] = []

  for (const m of sorted) {
    const day = formatDayFn(m.createdAt)
    const last = out[out.length - 1]
    if (last && last.day === day) {
      last.items.push(m)
    } else {
      out.push({ day, items: [m] })
    }
  }

  return out
}

/**
 * Atualiza uma mensagem existente em uma lista ou a adiciona se não existir.
 * Mantém a ordenação cronológica estrita.
 */
export function upsertMessage(messages: Message[], messageToUpsert: Message): Message[] {
  const exists = messages.some((m) => m.id === messageToUpsert.id)
  if (exists) {
    return messages.map((m) => (m.id === messageToUpsert.id ? messageToUpsert : m))
  }
  return sortMessagesChronologically([...messages, messageToUpsert])
}

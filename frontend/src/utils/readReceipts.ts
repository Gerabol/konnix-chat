import type { ReadReceipt } from '../api'

/**
 * Formata o resumo textual da quantidade de visualizações de uma mensagem.
 */
export function formatReaderCount(count: number): string {
  if (count <= 0) return 'Ainda não lida por outra pessoa.'
  if (count === 1) return 'Lida por 1 pessoa'
  return `Lida por ${count} pessoas`
}

/**
 * Ordena os recibos de leitura em ordem cronológica crescente (primeiros a ler no topo).
 */
export function sortReadersByDate(readers: ReadReceipt[]): ReadReceipt[] {
  return [...readers].sort((a, b) => new Date(a.readAt).getTime() - new Date(b.readAt).getTime())
}

/**
 * Retorna o nome para exibição de um leitor (nome completo se preenchido, ou username).
 */
export function readerDisplayName(reader: ReadReceipt): string {
  const name = reader.name?.trim()
  if (name) return name
  return reader.username || 'Usuário'
}

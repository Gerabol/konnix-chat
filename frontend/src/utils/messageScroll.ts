/**
 * Regras de auto-scroll da lista de mensagens.
 *
 * A lista acompanha o crescimento da altura para manter o usuário preso à última
 * mensagem quando chega conteúdo novo. Esse acompanhamento, porém, não pode ser
 * aplicado a todo e qualquer crescimento: abrir a transcrição de um áudio (ou
 * qualquer outro painel que expanda dentro de uma mensagem) aumenta a altura do
 * documento sem acrescentar conversa nova, e arrastar a visão para o fim nesse
 * caso tira o usuário do ponto que ele estava lendo.
 *
 * Estas funções são puras para poderem ser testadas isoladamente.
 */

/** Distância, em px, considerada "colado no fim" da conversa. */
export const NEAR_BOTTOM_THRESHOLD_PX = 120

/** Raiz visual de uma mensagem na timeline. */
export const MESSAGE_ROW_SELECTOR = '.message'

export interface ScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/**
 * Verdadeiro quando a lista está colada no fim, dentro da tolerância definida.
 */
export function isNearBottom(
  metrics: ScrollMetrics,
  threshold: number = NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight < threshold
}

/**
 * De onde veio o crescimento da altura da lista.
 *
 * - `tail`: conteúdo novo no fim da conversa (mensagem nova, upload pendente,
 *   divisor de dia). Deve acompanhar o scroll.
 * - `message`: conteúdo que expande dentro de uma mensagem já existente
 *   (transcrição de áudio, edição inline, reactions). Não deve mover a visão.
 * - `desconhecido`: crescimento sem mutação de DOM que o identifique, como numa
 *   transição de CSS ou no dimensionamento natural de uma mídia.
 *   Mantém o comportamento histórico de acompanhar quando o usuário está no fim.
 */
export type GrowthSource = 'tail' | 'message' | 'desconhecido'

/**
 * Descobre a origem do crescimento a partir dos registros de mutação do DOM.
 *
 * Um registro cujo alvo esteja dentro de `.message` é, por definição, uma
 * expansão de conteúdo que o usuário já está vendo. Registros com nós adicionados
 * ou removidos diretamente no fim da lista são conteúdo novo.
 */
export function classifyGrowth(records: ReadonlyArray<MutationRecord>): GrowthSource {
  let sawMessageGrowth = false

  for (const record of records) {
    if (isInsideMessageRow(record.target)) {
      sawMessageGrowth = true
      continue
    }
    if (record.addedNodes.length > 0 || record.removedNodes.length > 0) {
      return 'tail'
    }
  }

  return sawMessageGrowth ? 'message' : 'desconhecido'
}

/**
 * Verdadeiro quando o nó (ou seu pai, quando é um texto) está dentro de uma
 * mensagem da timeline.
 */
export function isInsideMessageRow(target: EventTarget | null | undefined): boolean {
  const element = toElement(target)
  if (!element) return false
  const row = typeof element.closest === 'function' ? element.closest(MESSAGE_ROW_SELECTOR) : null
  return row !== null
}

function toElement(target: EventTarget | null | undefined): Element | null {
  if (!target) return null
  if (isElement(target)) return target
  const parent = (target as Node).parentElement
  return parent ?? null
}

function isElement(value: unknown): value is Element {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Element).nodeType === 1 &&
    typeof (value as Element).closest === 'function'
  )
}
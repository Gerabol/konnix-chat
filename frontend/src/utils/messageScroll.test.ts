import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MESSAGE_ROW_SELECTOR,
  NEAR_BOTTOM_THRESHOLD_PX,
  classifyGrowth,
  isInsideMessageRow,
  isNearBottom,
} from './messageScroll.ts'

class FakeElement {
  nodeType = 1
  ancestors: string[]
  constructor(ancestors: string[] = []) {
    this.ancestors = ancestors
  }
  closest(selector: string): FakeElement | null {
    return this.ancestors.includes(selector) ? new FakeElement(this.ancestors) : null
  }
}

function record(target: unknown, added = 0, removed = 0): MutationRecord {
  return { target, addedNodes: new Array(added), removedNodes: new Array(removed) } as unknown as MutationRecord
}

describe('messageScroll utils', () => {
  describe('isNearBottom', () => {
    it('detecta a lista colada no fim', () => {
      assert.equal(isNearBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 }), true)
    })

    it('detecta a lista longe do fim', () => {
      assert.equal(isNearBottom({ scrollTop: 0, scrollHeight: 1000, clientHeight: 100 }), false)
    })

    it('respeita o limite informado', () => {
      const metrics = { scrollTop: 0, scrollHeight: 1000, clientHeight: 100 }
      assert.equal(isNearBottom(metrics), false)
      assert.equal(isNearBottom(metrics, 901), true)
    })

    it('usa o limite padrão de 120px como fronteira', () => {
      const metrics = { scrollTop: 780, scrollHeight: 1000, clientHeight: 100 }
      const distance = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight
      assert.equal(distance, NEAR_BOTTOM_THRESHOLD_PX)
      assert.equal(isNearBottom(metrics), false)
    })
  })

  describe('isInsideMessageRow', () => {
    it('reconhece nós dentro de uma mensagem', () => {
      assert.equal(isInsideMessageRow(new FakeElement([MESSAGE_ROW_SELECTOR])), true)
    })

    it('rejeita nós fora de uma mensagem', () => {
      assert.equal(isInsideMessageRow(new FakeElement(['.day-group'])), false)
    })

    it('sobe para o pai quando o alvo é um nó de texto', () => {
      const parent = new FakeElement([MESSAGE_ROW_SELECTOR])
      const textNode = { nodeType: 3, parentElement: parent }
      assert.equal(isInsideMessageRow(textNode as unknown as EventTarget), true)
    })

    it('trata alvo ausente sem quebrar', () => {
      assert.equal(isInsideMessageRow(null), false)
      assert.equal(isInsideMessageRow(undefined), false)
    })
  })

  describe('classifyGrowth', () => {
    it('trata crescimento dentro da mensagem como expansão interna', () => {
      const inside = new FakeElement([MESSAGE_ROW_SELECTOR])
      assert.equal(classifyGrowth([record(inside, 1)]), 'message')
    })

    it('trata nós anexados ao fim da lista como conteúdo novo', () => {
      const content = new FakeElement(['.message-list-content'])
      assert.equal(classifyGrowth([record(content, 1)]), 'tail')
    })

    it('trata remoção de nós da lista como conteúdo novo', () => {
      const content = new FakeElement(['.message-list-content'])
      assert.equal(classifyGrowth([record(content, 0, 1)]), 'tail')
    })

    it('ignora mutações que não alteram a lista de filhos', () => {
      const inside = new FakeElement([MESSAGE_ROW_SELECTOR])
      assert.equal(classifyGrowth([record(inside)]), 'message')
      assert.equal(classifyGrowth([record(new FakeElement(['.day-group']))]), 'desconhecido')
    })

    it('prioriza conteúdo novo quando chega mensagem e uma transcrição no mesmo lote', () => {
      const content = new FakeElement(['.message-list-content'])
      const inside = new FakeElement([MESSAGE_ROW_SELECTOR])
      assert.equal(classifyGrowth([record(inside, 1), record(content, 1)]), 'tail')
    })

    it('devolve desconhecido sem mutações', () => {
      assert.equal(classifyGrowth([]), 'desconhecido')
    })
  })
})